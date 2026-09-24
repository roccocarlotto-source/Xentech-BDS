import type { ResenaModeracion } from "@prisma/client";
import { agentToggleRepository } from "../repositories/agentToggle.repository";
import { resenaRepository, type ResenaRepository } from "../repositories/resena.repository";
import { generarTokenPlano, hashToken, tieneFormatoDeToken } from "../lib/resenas/token";
import type { PublicarResenaInput } from "../schemas/resena.schema";
import { AppError } from "../utils/AppError";

// Etapa 3 de docs/seguimiento-resenas-diseno.md: reseñas por link
// personalizado (§6.1). Las dependencias se inyectan (mismo patrón que el
// orquestador del agente) para poder testear las reglas sin una base real.

// Los métodos de Prisma devuelven PrismaPromise/clients encadenables; para
// las reglas de acá alcanza con "algo que resuelve a ese valor", que es lo
// que un fake en memoria puede dar.
type Asincrono<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

export interface ResenaDeps {
  repo: Asincrono<ResenaRepository>;
  moduloHabilitado: (organizationId: string) => Promise<boolean>;
  ahora: () => Date;
  generarToken: () => string;
}

const defaultDeps: ResenaDeps = {
  repo: resenaRepository,
  moduloHabilitado: (organizationId) =>
    agentToggleRepository.isEnabled(organizationId, "SEGUIMIENTO_RESENAS"),
  ahora: () => new Date(),
  generarToken: generarTokenPlano,
};

// §6.1 "vencimiento configurable (default 30 días)": el valor por
// organización vive en ConfigSeguimiento.diasValidezTokenResena; sin fila de
// config todavía, se usa el mismo default del schema.
export const DIAS_VALIDEZ_DEFAULT = 30;

export const RESENAS_POR_PAGINA = 20;

// Un solo mensaje, amable y sin detalle, para TODO caso de link inválido
// (no existe, vencido, ya usado, cliente borrado, módulo apagado): §6.1 pide
// no revelar datos del cliente, y distinguir los casos le diría a quien
// prueba tokens cuáles existen.
export const MENSAJE_LINK_INVALIDO =
  "Este link de reseña ya no está disponible. Puede que haya vencido o que ya se haya usado. ¡Gracias igual!";

function linkInvalido(): AppError {
  return new AppError(MENSAJE_LINK_INVALIDO, 404);
}

// ---------------------------------------------------------------------------
// Panel (usuario autenticado de la organización)
// ---------------------------------------------------------------------------

export async function generarLinkResena(
  organizationId: string,
  input: { clienteId: string; presupuestoId?: string | null },
  deps: ResenaDeps = defaultDeps,
): Promise<{ token: string; venceEn: Date }> {
  const cliente = await deps.repo.findCliente(organizationId, input.clienteId);
  if (!cliente) {
    throw new AppError("Cliente no encontrado", 404);
  }

  if (input.presupuestoId) {
    const presupuesto = await deps.repo.findPresupuesto(organizationId, input.presupuestoId);
    if (!presupuesto) {
      throw new AppError("Presupuesto no encontrado", 404);
    }
    if (presupuesto.clienteId !== input.clienteId) {
      throw new AppError("El presupuesto no es de ese cliente", 400);
    }
  }

  const dias = (await deps.repo.diasValidezToken(organizationId)) ?? DIAS_VALIDEZ_DEFAULT;
  const venceEn = new Date(deps.ahora().getTime() + dias * 24 * 60 * 60 * 1000);
  const token = deps.generarToken();

  await deps.repo.crearToken({
    organizationId,
    tokenHash: hashToken(token),
    clienteId: input.clienteId,
    presupuestoId: input.presupuestoId ?? null,
    venceEn,
  });

  // El token en claro sale SOLO en esta respuesta: en la base queda el hash.
  return { token, venceEn };
}

export function listarResenas(
  organizationId: string,
  moderacion?: ResenaModeracion,
  deps: ResenaDeps = defaultDeps,
) {
  return deps.repo.listar(organizationId, moderacion);
}

export async function moderarResena(
  organizationId: string,
  resenaId: string,
  moderadoPorId: string,
  input: { moderacion: ResenaModeracion; motivo?: string | null },
  deps: ResenaDeps = defaultDeps,
): Promise<void> {
  const resena = await deps.repo.findResena(organizationId, resenaId);
  if (!resena) {
    throw new AppError("Reseña no encontrada", 404);
  }

  await deps.repo.moderar(organizationId, resenaId, {
    moderacion: input.moderacion,
    moderadoPorId,
    moderadoEn: deps.ahora(),
    // Al volver a aprobar, el motivo de un rechazo anterior ya no aplica.
    motivoModeracion: input.moderacion === "RECHAZADA" ? (input.motivo ?? null) : null,
  });
}

// ---------------------------------------------------------------------------
// Público (sin sesión)
// ---------------------------------------------------------------------------

// Resuelve un token en claro a su fila, o tira el 404 genérico. Todo lo que
// hace inválido un link se chequea acá, en un solo lugar.
async function resolverTokenVigente(token: string, deps: ResenaDeps) {
  if (!tieneFormatoDeToken(token)) throw linkInvalido();

  const fila = await deps.repo.findTokenPorHash(hashToken(token));
  if (!fila) throw linkInvalido();
  if (fila.usadoEn) throw linkInvalido();
  if (fila.venceEn.getTime() <= deps.ahora().getTime()) throw linkInvalido();
  if (fila.cliente.deletedAt) throw linkInvalido();

  const organizacion = await deps.repo.findOrganizacion(fila.organizationId);
  if (!organizacion) throw linkInvalido();
  if (!(await deps.moduloHabilitado(fila.organizationId))) throw linkInvalido();

  return { fila, organizacion };
}

// Lo que necesita la página /r/<token> para armar el formulario: a quién le
// deja la reseña, y el nombre para la opción "Publicar como {Nombre}". Nada
// más del cliente (ni teléfono, ni email, ni el presupuesto).
export async function obtenerFormularioPublico(
  token: string,
  deps: ResenaDeps = defaultDeps,
): Promise<{ organizacion: string; nombreCliente: string }> {
  const { fila, organizacion } = await resolverTokenVigente(token, deps);
  return { organizacion: organizacion.name, nombreCliente: fila.cliente.nombre };
}

export async function publicarResena(
  input: PublicarResenaInput,
  deps: ResenaDeps = defaultDeps,
): Promise<{ id: string }> {
  const { fila } = await resolverTokenVigente(input.token, deps);

  const resena = await deps.repo.consumirTokenYCrearResena({
    tokenId: fila.id,
    organizationId: fila.organizationId,
    clienteId: fila.clienteId,
    ahora: deps.ahora(),
    anonimo: input.anonimo,
    // Copia del nombre al momento de publicar (ver el modelo Resena).
    nombreVisible: input.anonimo ? null : fila.cliente.nombre,
    estrellas: input.estrellas,
    comentario: input.comentario,
  });

  // null = otro request usó el token entre la validación de arriba y el
  // UPDATE condicional (o venció justo en el medio).
  if (!resena) throw linkInvalido();
  return resena;
}

export interface ListadoPublico {
  organizacion: string;
  total: number;
  promedio: number | null;
  pagina: number;
  totalPaginas: number;
  resenas: {
    id: string;
    nombre: string | null;
    estrellas: number;
    comentario: string | null;
    fecha: Date;
  }[];
}

// Listado público de reseñas APROBADAS de una organización, para la web de
// la empresa. Organización inexistente y módulo apagado dan el mismo 404.
export async function listarResenasPublicas(
  slug: string,
  pagina: number,
  deps: ResenaDeps = defaultDeps,
): Promise<ListadoPublico> {
  const organizacion = await deps.repo.findOrganizacionPorSlug(slug);
  if (!organizacion || !(await deps.moduloHabilitado(organizacion.id))) {
    throw new AppError("No encontrado", 404);
  }

  const [resumen, resenas] = await Promise.all([
    deps.repo.resumenPublico(organizacion.id),
    deps.repo.listarPublicas(
      organizacion.id,
      (pagina - 1) * RESENAS_POR_PAGINA,
      RESENAS_POR_PAGINA,
    ),
  ]);

  return {
    organizacion: organizacion.name,
    total: resumen.total,
    promedio: resumen.promedio === null ? null : Math.round(resumen.promedio * 10) / 10,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(resumen.total / RESENAS_POR_PAGINA)),
    resenas: resenas.map((r) => ({
      id: r.id,
      nombre: r.anonimo ? null : r.nombreVisible,
      estrellas: r.estrellas,
      comentario: r.comentario,
      fecha: r.createdAt,
    })),
  };
}
