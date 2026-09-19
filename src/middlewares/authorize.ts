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
