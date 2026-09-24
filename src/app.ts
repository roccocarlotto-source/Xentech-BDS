import compression from "compression";
import cors from "cors";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { healthRouter } from "./routes/health";
import { clientesRouter } from "./routes/clientes";
import { clientesImportRouter } from "./routes/clientesImport";
import { meRouter } from "./routes/me";
import { adminOrganizationsRouter } from "./routes/adminOrganizations";
import { agentConfigRouter } from "./routes/agentConfig";
import { whatsappConnectionRouter } from "./routes/whatsappConnection";
import { knowledgeBaseEntriesRouter } from "./routes/knowledgeBaseEntries";
import { usersRouter } from "./routes/users";
import { conversationsRouter } from "./routes/conversations";
import { whatsappWebhookRouter } from "./routes/webhooks/whatsapp";
import { resenasPublicRouter } from "./routes/resenasPublic";
import { resenasRouter } from "./routes/resenas";
import { presupuestosImportRouter } from "./routes/presupuestosImport";
import { AppError } from "./utils/AppError";
import { parseAllowedOrigins } from "./lib/corsOrigins";
import { getRateLimitOptions } from "./lib/rateLimitConfig";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: parseAllowedOrigins(process.env.CORS_ORIGINS) }));
  // Límite genérico por IP para toda la API -- ver src/lib/rateLimitConfig.ts.
  // No es el rate limiting específico del loop del agente de IA (pendiente,
  // docs/ai-agent-architecture.md §12), es la protección base contra abuso.
  app.use(rateLimit(getRateLimitOptions()));
  app.use(compression());
  // `verify` guarda el body crudo en req.rawBody -- lo necesita el webhook
  // de WhatsApp (src/routes/webhooks/whatsapp.ts) para validar la firma
  // X-Hub-Signature-256, que es un HMAC sobre los bytes tal cual llegaron,
  // no sobre el JSON ya parseado. No afecta a ninguna otra ruta.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = buf;
      },
    }),
  );
  app.use(pinoHttp());

  app.use(healthRouter);
  app.use(whatsappWebhookRouter);
  // Rutas públicas (sin sesión) ANTES de cualquier router que haga
  // `router.use(authenticate)` sin path -- esos aplican authenticate a todo
  // request que pase por ellos, así que una ruta pública montada después
  // pediría login.
  app.use(resenasPublicRouter);
  app.use(meRouter);
  // Antes de clientesRouter a propósito: si fuera después, Express
  // matchearía "import" como :id de GET /api/clientes/:id (mismo motivo que
  // el orden de /api/clientes/stats dentro de clientes.ts).
  app.use(clientesImportRouter);
  app.use(clientesRouter);
  app.use(adminOrganizationsRouter);
  app.use(agentConfigRouter);
  app.use(whatsappConnectionRouter);
  app.use(knowledgeBaseEntriesRouter);
  app.use(usersRouter);
  app.use(conversationsRouter);
  app.use(resenasRouter);
  app.use(presupuestosImportRouter);

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
