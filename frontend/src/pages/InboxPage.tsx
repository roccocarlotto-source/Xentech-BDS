import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import { useAuth } from "../auth/AuthContext";
import {
  CONVERSATION_STATUS_LABELS,
  type ConversationDetailResponse,
  type ConversationListItem,
  type ConversationStatus,
  type Message,
} from "../types/conversation";

// Fase 5, paso 4 (docs/ai-agent-architecture.md §8): inbox de
// conversaciones derivadas a un humano. Las respuestas que se mandan acá
// quedan guardadas pero NO se entregan todavía por WhatsApp real -- eso es
// el paso 5 del plan, todavía no arrancó (decisión de Rocco: priorizar
// tener el inbox utilizable ya mismo).
type FiltroEstado = ConversationStatus | "TODAS";

const FILTROS: { value: FiltroEstado; label: string }[] = [
  { value: "TRANSFERRED_TO_HUMAN", label: "Derivadas a una persona" },
  { value: "TODAS", label: "Todas" },
  { value: "ACTIVE", label: "Activas (con el agente)" },
  { value: "CLOSED", label: "Cerradas" },
];

function conversationsQueryKey(filtro: FiltroEstado) {
  return ["conversations", filtro] as const;
}

function ultimoMensaje(conversation: ConversationListItem): Message | undefined {
  return conversation.messages[0];
}

function formatFecha(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SENDER_LABELS: Record<Message["senderType"], string> = {
  CLIENTE: "Cliente",
  AGENT: "Agente",
  HUMAN: "Vos",
};

export function InboxPage() {
  const { logout } = useAuth();
  const [filtro, setFiltro] = useState<FiltroEstado>("TRANSFERRED_TO_HUMAN");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: conversationsQueryKey(filtro),
    queryFn: ({ signal }) =>
      request<ConversationListItem[]>(
        `/conversations${filtro === "TODAS" ? "" : `?status=${filtro}`}`,
        { getAccessToken, signal },
      ),
  });

  return (
    <div className="inbox-page">
      <header className="inbox-header">
        <h1>Inbox</h1>
        <div className="inbox-header-actions">
          <Link to="/">Volver a clientes</Link>
          <button type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="inbox-body">
        <aside className="inbox-list-pane">
          <label className="inbox-filter">
            Mostrar
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroEstado)}>
              {FILTROS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {conversationsQuery.isLoading && <p className="page-message">Cargando conversaciones…</p>}
          {conversationsQuery.isError && (
            <p className="page-message">No se pudieron cargar las conversaciones.</p>
          )}
          {conversationsQuery.data && conversationsQuery.data.length === 0 && (
            <p className="page-message">No hay conversaciones acá.</p>
          )}

          <ul className="inbox-list">
            {conversationsQuery.data?.map((conversation) => {
              const last = ultimoMensaje(conversation);
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={
                      conversation.id === selectedId
                        ? "inbox-list-item inbox-list-item-selected"
                        : "inbox-list-item"
                    }
                    onClick={() => setSelectedId(conversation.id)}
                  >
                    <div className="inbox-list-item-top">
                      <strong>{conversation.cliente?.nombre ?? "Cliente sin identificar"}</strong>
                      <span className={`inbox-status inbox-status-${conversation.status}`}>
                        {CONVERSATION_STATUS_LABELS[conversation.status]}
                      </span>
                    </div>
                    {conversation.cliente?.telefono && (
                      <div className="inbox-list-item-telefono">
                        {conversation.cliente.telefono}
                      </div>
                    )}
                    {last && <p className="inbox-list-item-preview">{last.content}</p>}
                    <span className="inbox-list-item-fecha">
                      {formatFecha(conversation.lastMessageAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="inbox-detail-pane">
          {selectedId ? (
            <ConversationDetail conversationId={selectedId} filtro={filtro} />
          ) : (
            <p className="page-message">Elegí una conversación de la lista.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationDetail({
  conversationId,
  filtro,
}: {
  conversationId: string;
  filtro: FiltroEstado;
}) {
  const queryClient = useQueryClient();
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["conversation", conversationId] as const,
    queryFn: ({ signal }) =>
      request<ConversationDetailResponse>(`/conversations/${conversationId}`, {
        getAccessToken,
        signal,
      }),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["conversation", conversationId] });
    void queryClient.invalidateQueries({ queryKey: conversationsQueryKey(filtro) });
  }

  const replyMutation = useMutation({
    mutationFn: (texto: string) =>
      request<Message>(`/conversations/${conversationId}/reply`, {
        method: "POST",
        body: { mensaje: texto },
        getAccessToken,
      }),
    onSuccess: () => {
      setMensaje("");
      invalidate();
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: "ACTIVE" | "CLOSED") =>
      request<unknown>(`/conversations/${conversationId}/status`, {
        method: "PATCH",
        body: { status },
        getAccessToken,
      }),
    onSuccess: invalidate,
  });

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!mensaje.trim()) return;
    setError(null);
    try {
      await replyMutation.mutateAsync(mensaje);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo mandar la respuesta.");
    }
  }

  if (detailQuery.isLoading) {
    return <p className="page-message">Cargando conversación…</p>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <p className="page-message">No se pudo cargar la conversación.</p>;
  }

  const { conversation, mensajes } = detailQuery.data;
  const cerrada = conversation.status === "CLOSED";

  return (
    <div className="inbox-detail">
      <div className="inbox-detail-header">
        <div>
          <strong>{conversation.cliente?.nombre ?? "Cliente sin identificar"}</strong>
          {conversation.cliente?.telefono && (
            <span className="inbox-detail-telefono"> · {conversation.cliente.telefono}</span>
          )}
        </div>
        <div className="inbox-detail-actions">
          {conversation.status !== "ACTIVE" && (
            <button
              type="button"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("ACTIVE")}
            >
              Devolver al agente
            </button>
          )}
          {!cerrada && (
            <button
              type="button"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate("CLOSED")}
            >
              Cerrar conversación
            </button>
          )}
        </div>
      </div>

      <ul className="inbox-thread">
        {mensajes.map((m) => (
          <li key={m.id} className={`inbox-message inbox-message-${m.senderType.toLowerCase()}`}>
            <span className="inbox-message-label">{SENDER_LABELS[m.senderType]}</span>
            <p>{m.content}</p>
          </li>
        ))}
      </ul>

      <p className="agent-config-hint">
        Lo que mandes acá queda guardado, pero todavía no se entrega por WhatsApp real -- eso
        arranca cuando esté lista la conexión (paso 5 del plan).
      </p>

      {error && <p className="agent-config-error">{error}</p>}

      <form className="inbox-reply-form" onSubmit={(e) => void handleReply(e)}>
        <textarea
          rows={2}
          required
          disabled={cerrada}
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          placeholder={cerrada ? "Conversación cerrada" : "Escribí tu respuesta…"}
        />
        <button type="submit" disabled={cerrada || replyMutation.isPending}>
          {replyMutation.isPending ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
