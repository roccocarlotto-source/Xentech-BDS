import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, request, requestFormData } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import type { Cliente } from "../types/cliente";
import type {
  CommitImportPresupuestoInput,
  ConsentimientoWhatsappOrigen,
  PresupuestoCreado,
  PreviewImportPresupuestoResult,
} from "../types/presupuestoImport";

// Etapa 4 de docs/seguimiento-resenas-diseno.md (§6.2): importación de
// presupuestos con revisión humana. Mismo patrón de dos pasos que
// ImportClientesPage -- /preview no persiste nada, /commit recién ahí crea
// Cliente (si hace falta), Presupuesto y su(s) Consentimiento(s).
//
// Sin cubrir todavía en esta pantalla (el backend sí lo soporta): asignar
// un vendedor del sistema al presupuesto -- /api/users es solo para el
// admin de la organización (ver users.ts), y esta pantalla es para
// cualquier usuario, así que no hay de dónde sacar la lista acá.

type Paso = "elegir" | "revisar" | "resultado";
type ModoCliente = "existente" | "nuevo";
type RespuestaWhatsapp = "" | "si" | "no";

const SOLO_DIGITOS = /\D/g;

function soloDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(SOLO_DIGITOS, "");
}

// Matching best-effort por teléfono para sugerir un cliente ya cargado --
// nunca crea ni decide nada solo, la persona siempre confirma en la
// pantalla. Compara los últimos 8 dígitos para tolerar prefijos de país
// distintos (mismo problema de fondo que normalizarTelefono() en el
// backend, pero acá alcanza con una heurística simple).
function buscarClientePorTelefono(clientes: Cliente[], telefono: string | null): Cliente | null {
  const buscado = soloDigitos(telefono);
  if (buscado.length < 6) return null;
  const cola = buscado.slice(-8);
  return clientes.find((c) => soloDigitos(c.telefono).slice(-8) === cola) ?? null;
}

export function ImportPresupuestosPage() {
  const queryClient = useQueryClient();

  const [paso, setPaso] = useState<Paso>("elegir");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewImportPresupuestoResult | null>(null);
  const [resultado, setResultado] = useState<PresupuestoCreado | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [errorPreview, setErrorPreview] = useState<string | null>(null);

  // Revisión: arranca vacío/en blanco, se precarga con el draft de la IA
  // apenas llega el preview (ver el useEffect más abajo) -- nunca se manda
  // nada al backend sin que la persona lo haya visto en estos inputs.
  const [modoCliente, setModoCliente] = useState<ModoCliente>("nuevo");
  const [clienteId, setClienteId] = useState("");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [emailNuevo, setEmailNuevo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("");
  const [fechaEmision, setFechaEmision] = useState("");
  const [validoHasta, setValidoHasta] = useState("");
  const [seguimientoWhatsapp, setSeguimientoWhatsapp] = useState<RespuestaWhatsapp>("");
  const [origenWhatsapp, setOrigenWhatsapp] = useState<ConsentimientoWhatsappOrigen | "">("");

  // Sin `enabled` a propósito: se pide una sola vez, de entrada -- así ya
  // está (o está en camino) para cuando analizarArchivo() la necesita para
  // sugerir un cliente por teléfono, sin depender del orden de renders.
  const clientesQuery = useQuery({
    queryKey: ["clientes"],
    queryFn: ({ signal }) => request<Cliente[]>("/clientes", { getAccessToken, signal }),
  });

  // Precarga los campos de la pantalla de revisión con el draft de la IA --
  // se llama una sola vez, desde analizarArchivo() (nunca desde un efecto:
  // es una reacción a la respuesta de /preview, no una sincronización con
  // algo externo que cambie por su cuenta).
  function precargarRevision(datos: PreviewImportPresupuestoResult["datos"], clientes: Cliente[]) {
    const match = buscarClientePorTelefono(clientes, datos.telefono);
    if (match) {
      setModoCliente("existente");
      setClienteId(match.id);
    } else {
      setModoCliente("nuevo");
      setNombreNuevo(datos.clienteNombre ?? "");
      setTelefonoNuevo(datos.telefono ?? "");
      setEmailNuevo(datos.email ?? "");
    }
    setDescripcion(datos.items ?? "");
    setMonto(datos.monto !== null ? String(datos.monto) : "");
    setMoneda(datos.moneda ?? "");
    setFechaEmision(datos.fechaEmision ?? "");
  }

  function reiniciar() {
    setPaso("elegir");
    setArchivo(null);
    setPreview(null);
    setResultado(null);
    setErrorPreview(null);
    setModoCliente("nuevo");
    setClienteId("");
    setNombreNuevo("");
    setTelefonoNuevo("");
    setEmailNuevo("");
    setDescripcion("");
    setMonto("");
    setMoneda("");
    setFechaEmision("");
    setValidoHasta("");
    setSeguimientoWhatsapp("");
    setOrigenWhatsapp("");
  }

  async function analizarArchivo() {
    if (!archivo) return;
    setCargandoPreview(true);
    setErrorPreview(null);
    try {
      const formData = new FormData();
      formData.append("file", archivo);
      const data = await requestFormData<PreviewImportPresupuestoResult>(
        "/presupuestos/import/preview",
        { formData, getAccessToken },
      );
      setPreview(data);
      const clientes = await queryClient.fetchQuery({
        queryKey: ["clientes"],
        queryFn: ({ signal }) => request<Cliente[]>("/clientes", { getAccessToken, signal }),
      });
      precargarRevision(data.datos, clientes);
      setPaso("revisar");
    } catch (err) {
      setErrorPreview(
        err instanceof ApiError ? err.message : "No se pudo analizar el presupuesto.",
      );
    } finally {
      setCargandoPreview(false);
    }
  }

  const commitMutation = useMutation({
    mutationFn: (input: CommitImportPresupuestoInput) =>
      request<PresupuestoCreado>("/presupuestos/import/commit", {
        method: "POST",
        body: input,
        getAccessToken,
      }),
    onSuccess: (data) => {
      setResultado(data);
      setPaso("resultado");
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
  });

  const clienteValido =
    modoCliente === "existente" ? clienteId.trim().length > 0 : nombreNuevo.trim().length > 0;
  const whatsappValido =
    seguimientoWhatsapp === "no" || (seguimientoWhatsapp === "si" && !!origenWhatsapp);
  const puedeConfirmar = clienteValido && seguimientoWhatsapp !== "" && whatsappValido;

  function confirmarImportacion() {
    if (!preview || !puedeConfirmar) return;

    const cliente: CommitImportPresupuestoInput["cliente"] =
      modoCliente === "existente"
        ? { modo: "existente", clienteId }
        : {
            modo: "nuevo",
            nombre: nombreNuevo.trim(),
            telefono: telefonoNuevo.trim() || null,
            email: emailNuevo.trim() || null,
          };

    commitMutation.mutate({
      archivoNombre: preview.archivoNombre,
      cliente,
      descripcion: descripcion.trim() || null,
      monto: monto.trim() ? Number(monto) : null,
      moneda: moneda.trim() || null,
      fechaEmision: fechaEmision.trim() || null,
      validoHasta: validoHasta.trim() || null,
      datosExtraidos: preview.datos as unknown as Record<string, unknown>,
      seguimientoWhatsapp: seguimientoWhatsapp === "si",
      consentimientoWhatsappOrigen: seguimientoWhatsapp === "si" ? origenWhatsapp || null : null,
    });
  }

  const errorCommit =
    commitMutation.error instanceof ApiError
      ? commitMutation.error.message
      : commitMutation.error
        ? "No se pudo guardar el presupuesto."
        : null;

  return (
    <div className="import-page">
      <header className="import-header">
        <h1>Importar presupuesto</h1>
        <Link to="/">Volver a clientes</Link>
      </header>

      {errorPreview && <p className="import-error">{errorPreview}</p>}

      {paso === "elegir" && (
        <section className="import-card">
          <p>
            Subí el presupuesto en .docx. La IA extrae los datos del cliente, el monto y la fecha --
            vos los revisás y corregís antes de guardar, nada se guarda todavía en este paso.
          </p>
          <input
            type="file"
            aria-label="Archivo del presupuesto"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={!archivo || cargandoPreview}
            onClick={() => void analizarArchivo()}
          >
            {cargandoPreview ? "Analizando…" : "Analizar presupuesto"}
          </button>
        </section>
      )}

      {paso === "revisar" && preview && (
        <section className="import-card">
          <p className="agent-config-hint">
            Archivo: {preview.archivoNombre}
            {preview.datos.vendedor && ` · Vendedor (según el texto): ${preview.datos.vendedor}`}
            {preview.datos.validez && ` · Validez (según el texto): ${preview.datos.validez}`}
          </p>

          {errorCommit && <p className="import-error">{errorCommit}</p>}

          <fieldset className="agent-config-fieldset">
            <legend>Cliente</legend>
            <div className="agent-config-checkbox-group">
              <label className="agent-config-checkbox">
                <input
                  type="radio"
                  name="modo-cliente"
                  checked={modoCliente === "existente"}
                  onChange={() => setModoCliente("existente")}
                />
                Cliente existente
              </label>
              <label className="agent-config-checkbox">
                <input
                  type="radio"
                  name="modo-cliente"
                  checked={modoCliente === "nuevo"}
                  onChange={() => setModoCliente("nuevo")}
                />
                Cliente nuevo
              </label>
            </div>

            {modoCliente === "existente" ? (
              <label className="agent-config-field">
                Elegir cliente
                <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Elegí un cliente…</option>
                  {clientesQuery.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {c.telefono ? ` (${c.telefono})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="agent-config-field">
                  Nombre *
                  <input value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
                </label>
                <label className="agent-config-field">
                  Teléfono
                  <input value={telefonoNuevo} onChange={(e) => setTelefonoNuevo(e.target.value)} />
                </label>
                <label className="agent-config-field">
                  Email
                  <input value={emailNuevo} onChange={(e) => setEmailNuevo(e.target.value)} />
                </label>
              </>
            )}
          </fieldset>

          <fieldset className="agent-config-fieldset">
            <legend>Presupuesto</legend>
            <label className="agent-config-field">
              Detalle (lo presupuestado)
              <textarea
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </label>
            <div className="agent-config-model-row">
              <label className="agent-config-field">
                Monto
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </label>
              <label className="agent-config-field">
                Moneda
                <input
                  maxLength={3}
                  placeholder="UYU"
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value.toUpperCase())}
                />
              </label>
            </div>
            <div className="agent-config-model-row">
              <label className="agent-config-field">
                Fecha de emisión
                <input
                  type="date"
                  value={fechaEmision}
                  onChange={(e) => setFechaEmision(e.target.value)}
                />
              </label>
              <label className="agent-config-field">
                Válido hasta
                <input
                  type="date"
                  value={validoHasta}
                  onChange={(e) => setValidoHasta(e.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="agent-config-fieldset">
            <legend>Seguimiento por WhatsApp *</legend>
            <p className="agent-config-hint">
              Obligatorio: solo marcá que sí si el cliente ya dio consentimiento para WhatsApp
              (pidió el presupuesto por ahí, o el vendedor lo acordó verbalmente). Sin
              consentimiento, el seguimiento va solo por email.
            </p>
            <div className="agent-config-checkbox-group">
              <label className="agent-config-checkbox">
                <input
                  type="radio"
                  name="seguimiento-whatsapp"
                  checked={seguimientoWhatsapp === "si"}
                  onChange={() => setSeguimientoWhatsapp("si")}
                />
                Sí, hay consentimiento de WhatsApp
              </label>
              <label className="agent-config-checkbox">
                <input
                  type="radio"
                  name="seguimiento-whatsapp"
                  checked={seguimientoWhatsapp === "no"}
                  onChange={() => {
                    setSeguimientoWhatsapp("no");
                    setOrigenWhatsapp("");
                  }}
                />
                No, solo por email
              </label>
            </div>

            {seguimientoWhatsapp === "si" && (
              <div className="agent-config-checkbox-group">
                <span>¿Cómo se dio el consentimiento?</span>
                <label className="agent-config-checkbox">
                  <input
                    type="radio"
                    name="origen-whatsapp"
                    checked={origenWhatsapp === "WHATSAPP_ENTRANTE"}
                    onChange={() => setOrigenWhatsapp("WHATSAPP_ENTRANTE")}
                  />
                  El cliente pidió el presupuesto por WhatsApp
                </label>
                <label className="agent-config-checkbox">
                  <input
                    type="radio"
                    name="origen-whatsapp"
                    checked={origenWhatsapp === "VERBAL_VENDEDOR"}
                    onChange={() => setOrigenWhatsapp("VERBAL_VENDEDOR")}
                  />
                  El vendedor lo acordó verbalmente
                </label>
              </div>
            )}
          </fieldset>

          <div className="import-actions">
            <button type="button" onClick={reiniciar} disabled={commitMutation.isPending}>
              Elegir otro archivo
            </button>
            <button
              type="button"
              disabled={!puedeConfirmar || commitMutation.isPending}
              onClick={confirmarImportacion}
            >
              {commitMutation.isPending ? "Guardando…" : "Guardar presupuesto"}
            </button>
          </div>
        </section>
      )}

      {paso === "resultado" && resultado && (
        <section className="import-card">
          <p>Presupuesto guardado correctamente.</p>
          <div className="import-actions">
            <button type="button" onClick={reiniciar}>
              Importar otro presupuesto
            </button>
            <Link to="/">Volver a clientes</Link>
          </div>
        </section>
      )}
    </div>
  );
}
