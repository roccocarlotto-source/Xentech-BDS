// Espejo del contrato real del backend (src/services/cliente.service.ts +
// src/utils/cuota.ts) — no agregar campos que esos módulos no devuelvan.
export type CuotaEstado = "AL_DIA" | "ATRASADO" | "SIN_DATOS";

export interface CuotaResumen {
  estado: CuotaEstado;
  diasAtraso: number;
}

export interface Cliente {
  id: string;
  organizationId: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  cuotaMonto: string | null;
  cuotaPeriodicidad: "MENSUAL" | null;
  cuotaUltimoPago: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  cuota: CuotaResumen;
}

export interface ClientesStats {
  total: number;
  alDia: number;
  atrasado: number;
  sinDatos: number;
}
