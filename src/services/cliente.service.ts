import type { Cliente } from "@prisma/client";
import { clienteRepository } from "../repositories/cliente.repository";
import { calcularCuota } from "../utils/cuota";
import { AppError } from "../utils/AppError";
import type { CreateClienteInput, UpdateClienteInput } from "../schemas/cliente.schema";

function conCuota(cliente: Cliente) {
  return { ...cliente, cuota: calcularCuota(cliente) };
}

export async function listClientes(organizationId: string) {
  const clientes = await clienteRepository.list(organizationId);
  return clientes.map(conCuota);
}

export interface ClientesStats {
  total: number;
  alDia: number;
  atrasado: number;
  sinDatos: number;
}

// Igual que listClientes: sin tabla/job de agregados, se recalcula leyendo
// todos los clientes de la organización y contando el estado ya calculado
// por calcularCuota() (mismo patrón perezoso que el resto del módulo). Para
// el volumen de datos de este MVP (una base de clientes por tenant, no
// millones de filas) esto es más simple que mantener contadores
// desnormalizados, y evita que se desincronicen.
export async function statsClientes(organizationId: string): Promise<ClientesStats> {
  const clientes = await listClientes(organizationId);
  return clientes.reduce<ClientesStats>(
    (acc, cliente) => {
      acc.total += 1;
      if (cliente.cuota.estado === "AL_DIA") acc.alDia += 1;
      else if (cliente.cuota.estado === "ATRASADO") acc.atrasado += 1;
      else acc.sinDatos += 1;
      return acc;
    },
    { total: 0, alDia: 0, atrasado: 0, sinDatos: 0 },
  );
}

export async function getCliente(organizationId: string, id: string) {
  const cliente = await clienteRepository.findById(organizationId, id);
  if (!cliente) {
    throw new AppError("Cliente no encontrado", 404);
  }
  return conCuota(cliente);
}

export async function createCliente(organizationId: string, input: CreateClienteInput) {
  const cliente = await clienteRepository.create(organizationId, input);
  return conCuota(cliente);
}

export async function updateCliente(organizationId: string, id: string, input: UpdateClienteInput) {
  // Verifica existencia + pertenencia a la organización antes de escribir
  // (getCliente ya tira 404 si no está o es de otro tenant).
  await getCliente(organizationId, id);
  const cliente = await clienteRepository.update(organizationId, id, input);
  return conCuota(cliente);
}

export async function deleteCliente(organizationId: string, id: string): Promise<void> {
  await getCliente(organizationId, id);
  await clienteRepository.softDelete(organizationId, id);
}
