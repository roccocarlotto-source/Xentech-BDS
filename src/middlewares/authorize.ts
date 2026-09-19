import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";

// Split authenticate.ts (identidad) / authorize.ts (permisos) — mismo
// criterio que PlataformaCRM. Va DESPUÉS de authenticate en cada router que
// lo use: depende de req.auth, que authenticate ya dejó resuelto.
export function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth?.isPlatformAdmin) {
    throw new AppError("Requiere permisos de administrador de plataforma", 403);
  }
  next();
}

// Fase 5: admin de la PROPIA organización (no platform admin) — es quien
// configura AgentConfig/KnowledgeBaseEntry de su tenant (decisión de Rocco
// en docs/ai-agent-architecture.md §1: lo configura el propio cliente, no
// Rocco). Actor y ruta de autorización distintos de requirePlatformAdmin a
// propósito — un platform admin NO pasa este gate (no pertenece a ninguna
// organización, y esto es explícitamente algo que decide el tenant).
export function requireOrgAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (
    !req.auth ||
    req.auth.isPlatformAdmin ||
    req.auth.role !== "ADMIN" ||
    !req.auth.organizationId
  ) {
    throw new AppError("Requiere permisos de administrador de la organización", 403);
  }
  next();
}
