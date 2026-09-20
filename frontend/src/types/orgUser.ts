// Espejo de src/repositories/user.repository.ts / src/schemas/userPermissions.schema.ts
// del backend (Fase 5, paso 4).

export interface OrgUser {
  id: string;
  organizationId: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  canHandleInbox: boolean;
}
