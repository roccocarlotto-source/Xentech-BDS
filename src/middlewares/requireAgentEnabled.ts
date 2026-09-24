import type { AgentType } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { agentToggleRepository } from "../repositories/agentToggle.repository";
import { AppError } from "../utils/AppError";

// Gate por módulo habilitado para la organización del usuario (toggle del
// panel de plataforma, organization_agent_toggles). Va DESPUÉS de
// authenticate. Un platform admin no pertenece a ninguna organización, así
// que nunca pasa.
export function requireAgentEnabled(agentType: AgentType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const organizationId = req.auth?.organizationId;
    if (!organizationId || req.auth?.isPlatformAdmin) {
      next(new AppError("Este módulo no está habilitado para tu organización", 403));
      return;
    }

    agentToggleRepository
      .isEnabled(organizationId, agentType)
      .then((enabled) => {
        next(
          enabled
            ? undefined
            : new AppError("Este módulo no está habilitado para tu organización", 403),
        );
      })
      .catch(next);
  };
}
