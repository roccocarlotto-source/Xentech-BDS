import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { healthRouter } from "./routes/health";
import { clientesRouter } from "./routes/clientes";
import { clientesImportRouter } from "./routes/clientesImport";
import { meRouter } from "./routes/me";
import { adminOrganizationsRouter } from "./routes/adminOrganizations";
import { agentConfigRouter } from "./routes/agentConfig";
import { knowledgeBaseEntriesRouter } from "./routes/knowledgeBaseEntries";
import { AppError } from "./utils/AppError";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json());
  app.use(pinoHttp());

  app.use(healthRouter);
  app.use(meRouter);
  // Antes de clientesRouter a propósito: si fuera después, Express
  // matchearía "import" como :id de GET /api/clientes/:id (mismo motivo que
  // el orden de /api/clientes/stats dentro de clientes.ts).
  app.use(clientesImportRouter);
  app.use(clientesRouter);
  app.use(adminOrganizationsRouter);
  app.use(agentConfigRouter);
  app.use(knowledgeBaseEntriesRouter);

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof AppError) {
        res.status(err.status).json({ error: err.message });
        return;
      }

      if (err instanceof ZodError) {
        res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
        return;
      }

      console.error(err);
      res.status(500).json({ error: "Error interno" });
    },
  );

  return app;
}
