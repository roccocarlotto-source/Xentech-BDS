import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import {
  WHATSAPP_CONNECTION_STATUS_LABELS,
  type UpsertWhatsAppConnectionInput,
  type WhatsAppConnection,
} from "../types/whatsappConnection";

const WHATSAPP_CONNECTION_QUERY_KEY = ["whatsapp-connection"] as const;

// Gap real encontrado navegando la app (2026-09-24): el modelo
// WhatsAppConnection y el webhook que lo lee existían desde el PR #32,
// pero no había ninguna pantalla para cargarlo -- ver el comentario en
// services/whatsappConnection.service.ts sobre por qué esto es carga
// manual en vez del flujo OAuth completo de Meta (Embedded Signup).
export function WhatsAppConnectionCard() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const connectionQuery = useQuery({
    queryKey: WHATSAPP_CONNECTION_QUERY_KEY,
    queryFn: ({ signal }) =>
      request<WhatsAppConnection | null>("/whatsapp-connection", { getAccessToken, signal }),
  });

  const upsertMutation = useMutation({
    mutationFn: (input: UpsertWhatsAppConnectionInput) =>
      request<WhatsAppConnection>("/whatsapp-connection", {
        method: "PUT",
        body: input,
        getAccessToken,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_CONNECTION_QUERY_KEY });
      closeForm();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => request<void>("/whatsapp-connection", { method: "DELETE", getAccessToken }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WHATSAPP_CONNECTION_QUERY_KEY });
    },
  });

  function openFormParaEditar(connection: WhatsAppConnection) {
    setFormError(null);
    setPhoneNumberId(connection.phoneNumberId);
    setWabaId(connection.wabaId);
    setDisplayPhoneNumber(connection.displayPhoneNumber ?? "");
    // El token nunca vuelve del backend (nunca se manda desencriptado) --
    // para cambiar cualquier otro dato hay que volver a pegarlo entero,
    // aunque no haya cambiado. Simplificación a propósito para v1.
    setAccessToken("");
    setFormOpen(true);
  }

  function openFormParaConectar() {
    setFormError(null);
    setPhoneNumberId("");
    setWabaId("");
    setDisplayPhoneNumber("");
    setAccessToken("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await upsertMutation.mutateAsync({
        phoneNumberId: phoneNumberId.trim(),
        wabaId: wabaId.trim(),
        displayPhoneNumber: displayPhoneNumber.trim() || undefined,
        accessToken: accessToken.trim(),
      });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo guardar la conexión.");
    }
  }

  async function handleDisconnect() {
    if (
      !window.confirm(
        "¿Desconectar este número de WhatsApp? El agente deja de recibir y responder mensajes por este canal hasta que se vuelva a conectar.",
      )
    ) {
      return;
    }
    setDisconnectError(null);
    try {
      await disconnectMutation.mutateAsync();
    } catch (err) {
      setDisconnectError(err instanceof ApiError ? err.message : "No se pudo desconectar.");
    }
  }

  const connection = connectionQuery.data ?? null;

  return (
    <section className="agent-config-card whatsapp-connection-card">
      <h2>Conexión de WhatsApp</h2>

      {connectionQuery.isLoading && <p className="page-message">Cargando conexión…</p>}
      {connectionQuery.isError && (
        <p className="page-message">No se pudo cargar el estado de la conexión.</p>
      )}

      {connectionQuery.isSuccess && !formOpen && (
        <>
          {connection ? (
            <div className="whatsapp-connection-info">
              <p>
                <span
                  className={`whatsapp-connection-status whatsapp-connection-status--${connection.status.toLowerCase()}`}
                >
                  {WHATSAPP_CONNECTION_STATUS_LABELS[connection.status]}
                </span>
              </p>
              <dl>
                <dt>Número</dt>
                <dd>{connection.displayPhoneNumber ?? "—"}</dd>
                <dt>Phone number ID</dt>
                <dd>{connection.phoneNumberId}</dd>
                <dt>WABA ID</dt>
                <dd>{connection.wabaId}</dd>
              </dl>
              <div className="whatsapp-connection-actions">
                <button type="button" onClick={() => openFormParaEditar(connection)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="whatsapp-connection-disconnect"
                  disabled={disconnectMutation.isPending}
                  onClick={() => void handleDisconnect()}
                >
                  {disconnectMutation.isPending ? "Desconectando…" : "Desconectar"}
                </button>
              </div>
              {disconnectError && <p className="agent-config-error">{disconnectError}</p>}
            </div>
          ) : (
            <div className="whatsapp-connection-info">
              <p className="page-message">Todavía no hay ningún número de WhatsApp conectado.</p>
              <button type="button" onClick={openFormParaConectar}>
                Conectar número
              </button>
            </div>
          )}
        </>
      )}

      {formOpen && (
        <form className="whatsapp-connection-form" onSubmit={(e) => void handleSubmit(e)}>
          <p className="whatsapp-connection-help">
            Estos datos los da Meta al terminar el Embedded Signup (o desde Meta for Developers): el
            ID del número de teléfono, el ID de la cuenta de WhatsApp Business (WABA) y un token de
            acceso del sistema.
          </p>
          <label className="agent-config-field">
            Phone number ID
            <input
              type="text"
              required
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
          </label>
          <label className="agent-config-field">
            WABA ID
            <input
              type="text"
              required
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
            />
          </label>
          <label className="agent-config-field">
            Número (para mostrar, opcional)
            <input
              type="text"
              placeholder="+598 99 123 456"
              value={displayPhoneNumber}
              onChange={(e) => setDisplayPhoneNumber(e.target.value)}
            />
          </label>
          <label className="agent-config-field">
            Token de acceso
            <input
              type="password"
              required
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={connection ? "Volver a pegarlo para guardar cambios" : undefined}
            />
          </label>
          {formError && <p className="agent-config-error">{formError}</p>}
          <div className="whatsapp-connection-form-actions">
            <button type="submit" disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={closeForm} disabled={upsertMutation.isPending}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
