import { z } from "zod";

export const createKnowledgeBaseEntrySchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  contenido: z.string().trim().min(1),
  isActive: z.boolean().optional(),
});

export const updateKnowledgeBaseEntrySchema = createKnowledgeBaseEntrySchema.partial();

export type CreateKnowledgeBaseEntryInput = z.infer<typeof createKnowledgeBaseEntrySchema>;
export type UpdateKnowledgeBaseEntryInput = z.infer<typeof updateKnowledgeBaseEntrySchema>;
