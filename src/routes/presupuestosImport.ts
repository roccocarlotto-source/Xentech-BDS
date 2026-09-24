import { Router, type Request } from "express";
import multer from "multer";
import { authenticate } from "../middlewares/authenticate";
import { requireAgentEnabled } from "../middlewares/requireAgentEnabled";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import { commitImportPresupuestoSchema } from "../schemas/presupuestoImport.schema";
import * as presupuestoImportService from "../services/presupuestoImport.service";

// Etapa 4 de docs/seguimiento-resenas-diseno.md (§6.2). Dos pasos, mismo
// gate que /api/resenas (SEGUIMIENTO_RESENAS habilitado, cualquier usuario
// de la organización -- no hace falta ser admin para cargar un
// presupuesto):
// - /preview (paso 1): sube el .docx, extrae texto + IA, no persiste nada.
// - /commit (paso 2): recibe lo que la persona confirmó en la pantalla de
//   revisión (JSON, sin el archivo) y crea Cliente (si hace falta),
//   Presupuesto y su(s) Consentimiento(s).
export const presupuestosImportRouter = Router();

presupuestosImportRouter.use(
  "/api/presupuestos/import",
  authenticate,
  requireAgentEnabled("SEGUIMIENTO_RESENAS"),
);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Memoria, no disco -- mismo criterio que clientesImport.ts: el archivo se
// procesa en el momento, este paso no lo guarda en ningún lado (el paso
// siguiente, que persiste el Presupuesto, es quien decide si sube el .docx
// original a Supabase Storage -- ver el comentario de Presupuesto.archivoPath
// en prisma/schema.prisma).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (file.originalname.toLowerCase().endsWith(".docx")) {
      cb(null, true);
    } else {
      cb(new AppError("Formato de archivo no soportado -- solo .docx", 400));
    }
  },
});

function requireFile(req: Request): Express.Multer.File {
  if (!req.file) {
    throw new AppError("Falta el archivo a importar", 400);
  }
  return req.file;
}

presupuestosImportRouter.post(
  "/preview",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = requireFile(req);
    res.json(
      await presupuestoImportService.previewImportPresupuesto(file.buffer, file.originalname),
    );
  }),
);

presupuestosImportRouter.post(
  "/commit",
  asyncHandler(async (req, res) => {
    const input = commitImportPresupuestoSchema.parse(req.body);
    const presupuesto = await presupuestoImportService.commitImportPresupuesto(
      req.auth!.organizationId,
      req.auth!.userId,
      input,
    );
    res.status(201).json(presupuesto);
  }),
);
