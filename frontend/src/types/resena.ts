// Espejo de src/services/resena.service.ts y src/repositories/resena.repository.ts
// del backend -- no agregar campos que esos módulos no devuelvan.

export type ResenaModeracion = "APROBADA" | "RECHAZADA";

export interface ResenaPanel {
  id: string;
  anonimo: boolean;
  nombreVisible: string | null;
  estrellas: number;
  comentario: string | null;
  moderacion: ResenaModeracion;
  moderadoEn: string | null;
  motivoModeracion: string | null;
  createdAt: string;
  cliente: { id: string; nombre: string };
  moderadoPor: { email: string } | null;
}

export interface LinkResena {
  token: string;
  venceEn: string;
}

export interface FormularioResena {
  organizacion: string;
  nombreCliente: string;
}

export interface ListadoResenasPublico {
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
    fecha: string;
  }[];
}

export const COMENTARIO_MAX = 1000;
