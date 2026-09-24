import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import { useAuth } from "../auth/AuthContext";
import {
  AGENT_TOOL_LABELS,
  GUARDRAIL_PROHIBIBLE_TOOLS,
  EMPTY_GUARDRAILS,
  type AgentConfig,
  type AgentToolName,
  type Guardrails,
  type TestMessageInput,
  type TestMessageResult,
  type UpsertAgentConfigInput,
} from "../types/agentConfig";
import type { KnowledgeBaseEntry, KnowledgeBaseEntryInput } from "../types/knowledgeBaseEntry";
import { WhatsAppConnectionCard } from "../components/WhatsAppConnectionCard";

// Fase 5, paso 3 del plan (docs/ai-agent-architecture.md §11): pantalla de
// configuración del agente de WhatsApp para el admin de la propia
// organización (requireOrgAdmin del lado del backend -- ver
// RequireOrgAdmin.tsx, que ya filtró el acceso antes de llegar acá). v1 =
// un solo tipo de agente (WHATSAPP); los otros dos (DATABASE_MANAGEMENT,
// REMINDERS) todavía no tienen lógica implementada.
const AGENT_TYPE = "WHATSAPP";

const AGENT_CONFIG_QUERY_KEY = ["agent-config", AGENT_TYPE] as const;
const KNOWLEDGE_BASE_QUERY_KEY = ["knowledge-base-entries"] as const;

function linesToArray(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function arrayToLines(items: string[]): string {
  return items.join("\n");
}

interface FormState {
  instructions: string;
  modelProvider: string;
  modelName: string;
  enabledTools: AgentToolName[];
  guardrails: Guardrails;
  // Los 4 campos de guardrails que son listas libres de texto se editan como
  // textarea (un ítem por línea); accionesProhibidas es la única lista
  // acotada al catálogo de tools, así que se maneja aparte con checkboxes.
  temasProhibidosText: string;
  condicionesDeDerivacionText: string;
  promesasProhibidasText: string;
  datosRequeridosAntesDeAccionText: string;
}

function formStateFromConfig(config: AgentConfig | null): FormState {
  const guardrails = config?.guardrails ?? EMPTY_GUARDRAILS;
  return {
    instructions: config?.instructions ?? "",
    modelProvider: config?.modelProvider ?? "openrouter",
    modelName: config?.modelName ?? "",
    enabledTools: config?.enabledTools ?? [],
    guardrails,
    temasProhibidosText: arrayToLines(guardrails.temasProhibidos),
    condicionesDeDerivacionText: arrayToLines(guardrails.condicionesDeDerivacion),
    promesasProhibidasText: arrayToLines(guardrails.promesasProhibidas),
    datosRequeridosAntesDeAccionText: arrayToLines(guardrails.datosRequeridosAntesDeAccion),
  };
}

export function AgentConfigPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const agentConfigQuery = useQuery({
    queryKey: AGENT_CONFIG_QUERY_KEY,
    queryFn: ({ signal }) =>
      request<AgentConfig | null>(`/agent-config/${AGENT_TYPE}`, { getAccessToken, signal }),
  });

  const [form, setForm] = useState<FormState>(() => formStateFromConfig(null));
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // La config puede llegar (o cambiar, ej. tras guardar) después del primer
  // render. En vez de un useEffect que dispare un setState extra (cascading
  // render), se ajusta el form durante el render mismo cuando cambia la
  // referencia de los datos -- patrón recomendado por React para derivar
  // estado de props/queries: https://react.dev/learn/you-might-not-need-an-effect
  const [syncedConfig, setSyncedConfig] = useState<AgentConfig | null | undefined>(undefined);
  if (agentConfigQuery.isSuccess && agentConfigQuery.data !== syncedConfig) {
    setSyncedConfig(agentConfigQuery.data);
    setForm(formStateFromConfig(agentConfigQuery.data));
  }

  const saveMutation = useMutation({
    mutationFn: (input: UpsertAgentConfigInput) =>
      request<AgentConfig>(`/agent-config/${AGENT_TYPE}`, {
        method: "PUT",
        body: input,
        getAccessToken,
      }),
    onSuccess: (config) => {
      queryClient.setQueryData(AGENT_CONFIG_QUERY_KEY, config);
      setSavedMessage("Configuración guardada.");
    },
  });

  function toggleTool(tool: AgentToolName) {
    setForm((prev) => ({
      ...prev,
      enabledTools: prev.enabledTools.includes(tool)
        ? prev.enabledTools.filter((t) => t !== tool)
        : [...prev.enabledTools, tool],
    }));
  }

  function toggleProhibida(tool: AgentToolName) {
    setForm((prev) => ({
      ...prev,
      guardrails: {
        ...prev.guardrails,
        accionesProhibidas: prev.guardrails.accionesProhibidas.includes(tool)
          ? prev.guardrails.accionesProhibidas.filter((t) => t !== tool)
          : [...prev.guardrails.accionesProhibidas, tool],
      },
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSavedMessage(null);
    const input: UpsertAgentConfigInput = {
      instructions: form.instructions,
      modelProvider: form.modelProvider,
      modelName: form.modelName,
      enabledTools: form.enabledTools,
      guardrails: {
        temasProhibidos: linesToArray(form.temasProhibidosText),
        accionesProhibidas: form.guardrails.accionesProhibidas,
        condicionesDeDerivacion: linesToArray(form.condicionesDeDerivacionText),
        promesasProhibidas: linesToArray(form.promesasProhibidasText),
        datosRequeridosAntesDeAccion: linesToArray(form.datosRequeridosAntesDeAccionText),
      },
    };
    try {
      await saveMutation.mutateAsync(input);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo guardar la configuración.");
    }
  }

  return (
    <div className="agent-config-page">
      <header className="agent-config-header">
        <h1>Agente de WhatsApp</h1>
        <div className="agent-config-header-actions">
          <Link to="/">Volver a clientes</Link>
          <button type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <WhatsAppConnectionCard />

      {agentConfigQuery.isLoading && <p className="page-message">Cargando configuración…</p>}
      {agentConfigQuery.isError && (
        <p className="page-message">No se pudo cargar la configuración del agente.</p>
      )}

      {agentConfigQuery.isSuccess && (
        <form className="agent-config-card" onSubmit={(e) => void handleSubmit(e)}>
          <h2>Comportamiento</h2>

          <label className="agent-config-field">
            Instrucciones
            <textarea
              rows={6}
              required
              value={form.instructions}
              onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
              placeholder="Sos el asistente de WhatsApp de [tu empresa]. Respondé de forma breve y amable…"
            />
          </label>

          <div className="agent-config-model-row">
            <label className="agent-config-field">
              Proveedor del modelo
              <input
                type="text"
                required
                value={form.modelProvider}
                onChange={(e) => setForm((prev) => ({ ...prev, modelProvider: e.target.value }))}
              />
            </label>
            <label className="agent-config-field">
              Modelo
              <input
                type="text"
                required
                placeholder="openai/gpt-4o-mini"
                value={form.modelName}
                onChange={(e) => setForm((prev) => ({ ...prev, modelName: e.target.value }))}
              />
            </label>
          </div>

          <fieldset className="agent-config-fieldset">
            <legend>Acciones habilitadas</legend>
            {GUARDRAIL_PROHIBIBLE_TOOLS.map((tool) => (
              <label key={tool} className="agent-config-checkbox">
                <input
                  type="checkbox"
                  checked={form.enabledTools.includes(tool)}
                  onChange={() => toggleTool(tool)}
                />
                {AGENT_TOOL_LABELS[tool]}
              </label>
            ))}
            <p className="agent-config-hint">
              Derivar a una persona del equipo está siempre disponible, aunque no se habilite acá.
            </p>
          </fieldset>

          <fieldset className="agent-config-fieldset">
            <legend>Guardrails</legend>

            <label className="agent-config-field">
              Temas prohibidos (uno por línea)
              <textarea
                rows={3}
                value={form.temasProhibidosText}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, temasProhibidosText: e.target.value }))
                }
              />
            </label>

            <div className="agent-config-checkbox-group">
              <span>Acciones prohibidas</span>
              {GUARDRAIL_PROHIBIBLE_TOOLS.map((tool) => (
                <label key={tool} className="agent-config-checkbox">
                  <input
                    type="checkbox"
                    checked={form.guardrails.accionesProhibidas.includes(tool)}
                    onChange={() => toggleProhibida(tool)}
                  />
                  {AGENT_TOOL_LABELS[tool]}
                </label>
              ))}
            </div>

            <label className="agent-config-field">
              Condiciones de derivación a un humano (una por línea)
              <textarea
                rows={3}
                value={form.condicionesDeDerivacionText}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, condicionesDeDerivacionText: e.target.value }))
                }
              />
            </label>

            <label className="agent-config-field">
              Promesas prohibidas (una por línea)
              <textarea
                rows={3}
                value={form.promesasProhibidasText}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, promesasProhibidasText: e.target.value }))
                }
              />
            </label>

            <label className="agent-config-field">
              Datos requeridos antes de ejecutar una acción (uno por línea)
              <textarea
                rows={3}
                value={form.datosRequeridosAntesDeAccionText}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    datosRequeridosAntesDeAccionText: e.target.value,
                  }))
                }
              />
            </label>
          </fieldset>

          {formError && <p className="agent-config-error">{formError}</p>}
          {savedMessage && !formError && <p className="agent-config-saved">{savedMessage}</p>}

          <button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Guardando…" : "Guardar configuración"}
          </button>
        </form>
      )}

      <KnowledgeBaseSection />

      {agentConfigQuery.data && <TestPanel />}
    </div>
  );
}

function KnowledgeBaseSection() {
  const queryClient = useQueryClient();
  const entriesQuery = useQuery({
    queryKey: KNOWLEDGE_BASE_QUERY_KEY,
    queryFn: ({ signal }) =>
      request<KnowledgeBaseEntry[]>("/knowledge-base-entries", { getAccessToken, signal }),
  });

  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: KNOWLEDGE_BASE_QUERY_KEY });
  }

  const createMutation = useMutation({
    mutationFn: (input: KnowledgeBaseEntryInput) =>
      request<KnowledgeBaseEntry>("/knowledge-base-entries", {
        method: "POST",
        body: input,
        getAccessToken,
      }),
    onSuccess: () => {
      setTitulo("");
      setContenido("");
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<KnowledgeBaseEntryInput> }) =>
      request<KnowledgeBaseEntry>(`/knowledge-base-entries/${id}`, {
        method: "PATCH",
        body: input,
        getAccessToken,
      }),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      request<void>(`/knowledge-base-entries/${id}`, { method: "DELETE", getAccessToken }),
    onSuccess: invalidate,
  });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createMutation.mutateAsync({ titulo, contenido });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la entrada.");
    }
  }

  return (
    <section className="agent-config-card">
      <h2>Base de conocimiento</h2>
      <p className="agent-config-hint">
        Se agrega entero al prompt del agente cuando está activa -- mantenela corta y concreta.
      </p>

      {entriesQuery.isLoading && <p className="page-message">Cargando entradas…</p>}
      {entriesQuery.isError && (
        <p className="page-message">No se pudieron cargar las entradas de la base.</p>
      )}

      {entriesQuery.data && entriesQuery.data.length > 0 && (
        <ul className="kb-list">
          {entriesQuery.data.map((entry) => (
            <li key={entry.id} className="kb-item">
              <div className="kb-item-header">
                <strong>{entry.titulo}</strong>
                <div className="kb-item-actions">
                  <label className="kb-item-active">
                    <input
                      type="checkbox"
                      checked={entry.isActive}
                      disabled={updateMutation.isPending}
                      onChange={(e) =>
                        updateMutation.mutate({
                          id: entry.id,
                          input: { isActive: e.target.checked },
                        })
                      }
                    />
                    Activa
                  </label>
                  <button
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(entry.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              <p className="kb-item-contenido">{entry.contenido}</p>
            </li>
          ))}
        </ul>
      )}

      {entriesQuery.data && entriesQuery.data.length === 0 && (
        <p className="page-message">Todavía no hay entradas.</p>
      )}

      <form className="kb-form" onSubmit={(e) => void handleCreate(e)}>
        <label className="agent-config-field">
          Título
          <input
            type="text"
            required
            maxLength={200}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </label>
        <label className="agent-config-field">
          Contenido
          <textarea
            rows={3}
            required
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
          />
        </label>
        {error && <p className="agent-config-error">{error}</p>}
        <button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Agregando…" : "Agregar entrada"}
        </button>
      </form>
    </section>
  );
}

interface TranscriptEntry {
  from: "cliente" | "agente";
  texto: string;
}

function TestPanel() {
  const [externalThreadId, setExternalThreadId] = useState("prueba-1");
  const [telefono, setTelefono] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [ultimoResultado, setUltimoResultado] = useState<TestMessageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendMutation = useMutation({
    mutationFn: (input: TestMessageInput) =>
      request<TestMessageResult>(`/agent-config/${AGENT_TYPE}/test-message`, {
        method: "POST",
        body: input,
        getAccessToken,
      }),
  });

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!mensaje.trim()) return;
    setError(null);
    const texto = mensaje;
    setTranscript((prev) => [...prev, { from: "cliente", texto }]);
    setMensaje("");
    try {
      const resultado = await sendMutation.mutateAsync({
        externalThreadId,
        telefono: telefono || undefined,
        mensaje: texto,
      });
      setUltimoResultado(resultado);
      setTranscript((prev) => [...prev, { from: "agente", texto: resultado.respuesta }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje de prueba.");
    }
  }

  return (
    <section className="agent-config-card">
      <h2>Probar el agente</h2>
      <p className="agent-config-hint">
        Simula una conversación sin esperar la conexión real de WhatsApp. El hilo (
        <code>externalThreadId</code>) identifica la conversación; el teléfono es opcional y sirve
        para probar la resolución de identidad contra un cliente existente.
      </p>

      <div className="agent-config-model-row">
        <label className="agent-config-field">
          Hilo de la conversación
          <input
            type="text"
            required
            value={externalThreadId}
            onChange={(e) => setExternalThreadId(e.target.value)}
          />
        </label>
        <label className="agent-config-field">
          Teléfono del cliente (opcional)
          <input
            type="text"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="+54 9 11 …"
          />
        </label>
      </div>

      {transcript.length > 0 && (
        <ul className="test-transcript">
          {transcript.map((entry, idx) => (
            // El transcript es solo la sesión actual del navegador, sin id propio.
            <li key={idx} className={`test-transcript-${entry.from}`}>
              <span className="test-transcript-label">
                {entry.from === "cliente" ? "Cliente" : "Agente"}
              </span>
              <p>{entry.texto}</p>
            </li>
          ))}
        </ul>
      )}

      {ultimoResultado?.derivadoAHumano && (
        <p className="agent-config-hint">
          La conversación quedó derivada a una persona del equipo (<code>TRANSFERRED_TO_HUMAN</code>
          ).
        </p>
      )}

      {error && <p className="agent-config-error">{error}</p>}

      <form className="kb-form" onSubmit={(e) => void handleSend(e)}>
        <label className="agent-config-field">
          Mensaje
          <textarea
            rows={2}
            required
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
          />
        </label>
        <button type="submit" disabled={sendMutation.isPending}>
          {sendMutation.isPending ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}
