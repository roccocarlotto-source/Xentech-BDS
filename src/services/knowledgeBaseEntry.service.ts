import { knowledgeBaseEntryRepository } from "../repositories/knowledgeBaseEntry.repository";
import { AppError } from "../utils/AppError";
import type {
  CreateKnowledgeBaseEntryInput,
  UpdateKnowledgeBaseEntryInput,
} from "../schemas/knowledgeBaseEntry.schema";

export async function listKnowledgeBaseEntries(organizationId: string) {
  return knowledgeBaseEntryRepository.list(organizationId);
}

export async function getKnowledgeBaseEntry(organizationId: string, id: string) {
  const entry = await knowledgeBaseEntryRepository.findById(organizationId, id);
  if (!entry) {
    throw new AppError("Entrada de la base de conocimiento no encontrada", 404);
  }
  return entry;
}

export async function createKnowledgeBaseEntry(
  organizationId: string,
  input: CreateKnowledgeBaseEntryInput,
) {
  return knowledgeBaseEntryRepository.create(organizationId, input);
}

export async function updateKnowledgeBaseEntry(
  organizationId: string,
  id: string,
  input: UpdateKnowledgeBaseEntryInput,
) {
  await getKnowledgeBaseEntry(organizationId, id);
  return knowledgeBaseEntryRepository.update(organizationId, id, input);
}

export async function deleteKnowledgeBaseEntry(organizationId: string, id: string): Promise<void> {
  await getKnowledgeBaseEntry(organizationId, id);
  await knowledgeBaseEntryRepository.softDelete(organizationId, id);
}
