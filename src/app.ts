import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { ZodError } from "zod";
import { healthRouter } from "./routes/health";
import { clientesRouter } from "./routes/clientes";
import { AppError } from "./utils/AppError";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json());
  app.use(pinoHttp());

  app.use(healthRouter);
  app.use(clientesRouter);

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
