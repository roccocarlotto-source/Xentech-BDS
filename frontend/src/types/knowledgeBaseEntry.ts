// Espejo de src/schemas/knowledgeBaseEntry.schema.ts y del modelo
// KnowledgeBaseEntry en prisma/schema.prisma del backend (Fase 5,
// docs/ai-agent-architecture.md §10). Org-wide, no por tipo de agente
// todavía.

export interface KnowledgeBaseEntry {
  id: string;
  organizationId: string;
  titulo: string;
  contenido: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseEntryInput {
  titulo: string;
  contenido: string;
  isActive?: boolean;
}
