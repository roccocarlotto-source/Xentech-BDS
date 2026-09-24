import { Router, type Request } from "express";
import multer from "multer";
import { authenticate } from "../middlewares/authenticate";
import { requireAgentEnabled } from "../middlewares/requireAgentEnabled";
import { asyncHandler } from "../utils/asyncHandler";
import { AppError } from "../utils/AppError";
import * as presupuestoImportService from "../services/presupuestoImport.service";

// Etapa 4, paso 1 de docs/seguimiento-resenas-diseno.md (§6.2): solo el
// preview de extracción (upload .docx -> texto -> IA), sin persistir nada
// todavía. Mismo gate que /api/resenas: requiere el módulo
// SEGUIMIENTO_RESENAS habilitado para la organización, cualquier usuario
// (no hace falta ser admin para cargar un presupuesto).
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
