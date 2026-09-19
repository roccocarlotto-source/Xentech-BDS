import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { requestFormData, ApiError } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import {
  CLIENTE_IMPORT_FIELDS,
  CLIENTE_IMPORT_FIELD_LABELS,
  CLIENTE_IMPORT_REQUIRED_FIELD,
  type ClienteImportMapping,
  type ClienteImportPreview,
  type ClienteImportResult,
} from "../types/importClientes";

type Paso = "elegir" | "revisar" | "resultado";

const SAMPLE_ROWS_TO_SHOW = 5;

// Fase 3 del roadmap — importación de clientes. Por ahora solo Excel
// (.xlsx); TXT y PDF quedan para una siguiente iteración, mismo alcance que
// el backend (ver src/services/importClientes.service.ts).
//
// Flujo en dos pasos: se manda el archivo para un preview (columnas +
// mapeo sugerido + muestra de filas), el usuario ajusta el mapeo en la
// pantalla de revisión, y recién ahí se confirma — mandando otra vez el
// mismo archivo + el mapeo elegido (el archivo no se guarda en el backend
// entre un paso y el otro).
export function ImportClientesPage() {
  const queryClient = useQueryClient();

  const [paso, setPaso] = useState<Paso>("elegir");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<ClienteImportPreview | null>(null);
  const [mapping, setMapping] = useState<ClienteImportMapping>({});
  const [resultado, setResultado] = useState<ClienteImportResult | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reiniciar() {
    setPaso("elegir");
    setArchivo(null);
    setPreview(null);
    setMapping({});
    setResultado(null);
    setError(null);
  }

  async function analizarArchivo() {
    if (!archivo) return;
    setCargando(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", archivo);
      const data = await requestFormData<ClienteImportPreview>("/clientes/import/preview", {
        formData,
        getAccessToken,
      });
      setPreview(data);
      setMapping(data.suggestedMapping);
      setPaso("revisar");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo analizar el archivo.");
    } finally {
      setCargando(false);
    }
  }

  async function confirmarImportacion() {
    if (!archivo || !mapping[CLIENTE_IMPORT_REQUIRED_FIELD]) return;
    setCargando(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", archivo);
      formData.append("mapping", JSON.stringify(mapping));
      const data = await requestFormData<ClienteImportResult>("/clientes/import/commit", {
        formData,
        getAccessToken,
      });
      setResultado(data);
      setPaso("resultado");
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la importación.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="import-page">
      <header className="import-header">
        <h1>Importar clientes</h1>
        <Link to="/">Volver a clientes</Link>
      </header>

      {error && <p className="import-error">{error}</p>}

      {paso === "elegir" && (
        <section className="import-card">
          <p>
            Subí un archivo Excel (.xlsx) con tus clientes. TXT y PDF todavía no están soportados.
          </p>
          <input
            type="file"
            aria-label="Archivo Excel"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={!archivo || cargando}
            onClick={() => void analizarArchivo()}
          >
            {cargando ? "Analizando…" : "Analizar archivo"}
          </button>
        </section>
      )}

      {paso === "revisar" && preview && (
        <section className="import-card">
          <p>
            Se encontraron <strong>{preview.totalRows}</strong> fila
            {preview.totalRows === 1 ? "" : "s"} y {preview.headers.length} columna
            {preview.headers.length === 1 ? "" : "s"}. Revisá qué columna corresponde a cada dato
            antes de importar.
          </p>

          <div className="import-mapping">
            {CLIENTE_IMPORT_FIELDS.map((field) => (
              <label key={field} className="import-mapping-row">
                <span>
                  {CLIENTE_IMPORT_FIELD_LABELS[field]}
                  {field === CLIENTE_IMPORT_REQUIRED_FIELD && " *"}
                </span>
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) =>
                    setMapping((prev) => ({
                      ...prev,
                      [field]: e.target.value || undefined,
                    }))
                  }
                >
                  <option value="">— no importar —</option>
                  {preview.headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {preview.sampleRows.length > 0 && (
            <div className="import-sample-wrapper">
              <table className="import-sample-table">
                <thead>
                  <tr>
                    {preview.headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.slice(0, SAMPLE_ROWS_TO_SHOW).map((row, idx) => (
                    // Las filas de la muestra no tienen id propio; el orden es estable (no se reordena).
                    <tr key={idx}>
                      {preview.headers.map((header) => (
                        <td key={header}>{String(row[header] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="import-actions">
            <button type="button" onClick={reiniciar} disabled={cargando}>
              Elegir otro archivo
            </button>
            <button
              type="button"
              disabled={!mapping[CLIENTE_IMPORT_REQUIRED_FIELD] || cargando}
              onClick={() => void confirmarImportacion()}
            >
              {cargando ? "Importando…" : `Importar ${preview.totalRows} clientes`}
            </button>
          </div>
        </section>
      )}

      {paso === "resultado" && resultado && (
        <section className="import-card">
          <p>
            Se importaron <strong>{resultado.creados}</strong> de {resultado.totalRows} filas.
          </p>

          {resultado.errores.length > 0 && (
            <div>
              <p>{resultado.errores.length} fila(s) no se pudieron importar:</p>
              <ul className="import-errors-list">
                {resultado.errores.map((err) => (
                  <li key={err.fila}>
                    Fila {err.fila}: {err.mensaje}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="import-actions">
            <button type="button" onClick={reiniciar}>
              Importar otro archivo
            </button>
            <Link to="/">Volver a clientes</Link>
          </div>
        </section>
      )}
    </div>
  );
}
