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
