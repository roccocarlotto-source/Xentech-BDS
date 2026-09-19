import { z } from "zod";
import { CLIENTE_IMPORT_FIELDS } from "../services/importClientes.service";

// El mapeo que arma el usuario en la pantalla de revisión: para cada campo
// del modelo, el nombre de columna del archivo que le corresponde (o
// ausente, si esa columna no está en el archivo / no se quiere importar).
const mappingShape = Object.fromEntries(
  CLIENTE_IMPORT_FIELDS.map((field) => [field, z.string().trim().min(1).optional()]),
) as Record<(typeof CLIENTE_IMPORT_FIELDS)[number], z.ZodOptional<z.ZodString>>;

export const clienteImportMappingSchema = z.object(mappingShape);

export type ClienteImportMappingInput = z.infer<typeof clienteImportMappingSchema>;
