import type { JWTPayload } from "jose";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import type { AuthContext } from "../types/auth";

// Resuelve el AuthContext real (organización, rol) a partir del payload ya
// verificado del JWT de Supabase. Primero se fija si es PlatformAdmin (no
// pertenece a ningún tenant); si no, busca su User de tenant.
export async function resolveAuthContext(payload: JWTPayload): Promise<AuthContext> {
  const userId = payload.sub;
  if (!userId) {
    throw new AppError("Token sin subject", 401);
  }

  const platformAdmin = await prisma.platformAdmin.findUnique({ where: { id: userId } });
  if (platformAdmin) {
    return {
      userId,
      organizationId: "",
      role: "ADMIN",
      isPlatformAdmin: true,
      canHandleInbox: false,
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    throw new AppError("Usuario no encontrado", 401);
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    isPlatformAdmin: false,
    canHandleInbox: user.canHandleInbox,
  };
}
