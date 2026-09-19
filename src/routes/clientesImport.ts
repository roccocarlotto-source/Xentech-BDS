import { Router, type Request } from "express";
import multer from "multer";
import { authenticate } from "../middlewares/authenticate";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { clienteImportMappingSchema } from "../schemas/importClientes.schema";
import * as importClientesService from "../services/importClientes.service";

export const clientesImportRouter = Router();

clientesImportRouter.use(authenticate);

function requireOrganizationId(req: Request): string {
  const organizationId = req.auth?.organizationId;
  if (!organizationId) {
    throw new AppError("Este usuario no pertenece a ninguna organización", 403);
  }
  return organizationId;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB, suficiente para un Excel de miles de filas.

// Memoria, no disco: el archivo se procesa en el momento y no se persiste
// en ningún lado (ver comentario en importClientes.service.ts sobre por
// qué el flujo de dos pasos no necesita guardar el archivo entre uno y
// otro).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

function requireFile(req: Request): Express.Multer.File {
  if (!req.file) {
    throw new AppError("Falta el archivo a importar", 400);
  }
  return req.file;
}

// Devuelve las columnas detectadas, una muestra de filas y un mapeo
// sugerido — con esto el frontend arma la pantalla de revisión.
clientesImportRouter.post(
  "/api/clientes/import/preview",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    requireOrganizationId(req); // Solo valida pertenencia a organización; no escribe nada.
    const file = requireFile(req);
    res.json(await importClientesService.previewImport(file.buffer));
  }),
);

// Confirma la importación: vuelve a recibir el mismo archivo + el mapeo que
// el usuario ajustó en la pantalla de revisión, y crea los clientes válidos.
// Las filas inválidas no abortan el resto — se reportan en `errores` con su
// número de fila para que el usuario las corrija y las reintente aparte.
clientesImportRouter.post(
  "/api/clientes/import/commit",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const organizationId = requireOrganizationId(req);
    const file = requireFile(req);

    const rawMapping = req.body.mapping;
    if (typeof rawMapping !== "string") {
      throw new AppError("Falta el mapeo de columnas", 400);
    }

    let parsedMapping: unknown;
    try {
      parsedMapping = JSON.parse(rawMapping);
    } catch {
      throw new AppError("El mapeo de columnas no es un JSON válido", 400);
    }

    const mapping = clienteImportMappingSchema.parse(parsedMapping);
    res.json(await importClientesService.commitImport(organizationId, file.buffer, mapping));
  }),
);
