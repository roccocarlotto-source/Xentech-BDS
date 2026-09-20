export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "ADMIN" | "MEMBER";
  isPlatformAdmin: boolean;
  // Fase 5, paso 4: permiso puntual (ver modelo User en prisma/schema.prisma)
  // que el admin de la organización otorga a un MEMBER para el inbox de
  // conversaciones derivadas. Siempre false para un PlatformAdmin.
  canHandleInbox: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
