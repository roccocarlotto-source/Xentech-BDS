import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import { useAuth } from "../auth/AuthContext";
import type { Cliente, ClientesStats } from "../types/cliente";
import { ClientesTable } from "../components/ClientesTable";
import { ClienteForm, type ClienteFormInput } from "../components/ClienteForm";
import { StatsDonut } from "../components/StatsDonut";

// "closed": ni alta ni edición abiertas. "create": formulario de alta
// vacío. "edit": formulario de edición precargado con un cliente
// existente -- guarda el cliente entero (no solo el id) para poder
// precargar ClienteForm sin esperar a otro fetch.
type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; cliente: Cliente };

const CLIENTES_QUERY_KEY = ["clientes"] as const;

export function ClientesPage() {
  const { logout, me } = useAuth();
  const queryClient = useQueryClient();
  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const clientesQuery = useQuery({
    queryKey: CLIENTES_QUERY_KEY,
    queryFn: ({ signal }) => request<Cliente[]>("/clientes", { getAccessToken, signal }),
  });

  const statsQuery = useQuery({
    queryKey: ["clientes", "stats"],
    queryFn: ({ signal }) => request<ClientesStats>("/clientes/stats", { getAccessToken, signal }),
  });

  // create y update comparten el mismo formulario/manejo de error --
  // invalidateQueries con la clave corta ["clientes"] alcanza para las dos
  // (matchea por prefijo, así que también refresca ["clientes","stats"]).
  const createMutation = useMutation({
    mutationFn: (input: ClienteFormInput) =>
      request<Cliente>("/clientes", { method: "POST", body: input, getAccessToken }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLIENTES_QUERY_KEY });
      setFormMode({ kind: "closed" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ClienteFormInput }) =>
      request<Cliente>(`/clientes/${id}`, { method: "PATCH", body: input, getAccessToken }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLIENTES_QUERY_KEY });
      setFormMode({ kind: "closed" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      request<void>(`/clientes/${id}`, { method: "DELETE", getAccessToken }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLIENTES_QUERY_KEY });
    },
  });

  async function handleFormSubmit(input: ClienteFormInput) {
    setFormError(null);
    try {
      if (formMode.kind === "edit") {
        await updateMutation.mutateAsync({ id: formMode.cliente.id, input });
      } else {
        await createMutation.mutateAsync(input);
      }
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "No se pudo guardar el cliente.");
    }
  }

  async function handleDelete(cliente: Cliente) {
    if (!window.confirm(`¿Eliminar a ${cliente.nombre}? Esta acción no se puede deshacer.`)) {
      return;
    }
    setDeleteError(null);
    setDeletingId(cliente.id);
    try {
      await deleteMutation.mutateAsync(cliente.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar el cliente.");
    } finally {
      setDeletingId(null);
    }
  }

  const formSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="clientes-page">
      <header className="clientes-header">
        <h1>Clientes</h1>
        <div className="clientes-header-actions">
          <Link to="/clientes/importar">Importar clientes</Link>
          {me && !me.isPlatformAdmin && (me.role === "ADMIN" || me.canHandleInbox) && (
            <Link to="/inbox">Inbox</Link>
          )}
          {me?.role === "ADMIN" && !me.isPlatformAdmin && (
            <>
              <Link to="/agente-whatsapp">Agente de WhatsApp</Link>
              <Link to="/usuarios">Usuarios</Link>
            </>
          )}
          <button type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className="stats-section">
        {statsQuery.isLoading && <p className="page-message">Cargando estadísticas…</p>}
        {statsQuery.isError && (
          <p className="page-message">No se pudieron cargar las estadísticas.</p>
        )}
        {statsQuery.data && <StatsDonut stats={statsQuery.data} />}
      </section>

      <section>
        {formMode.kind === "closed" && (
          <button
            type="button"
            className="clientes-nuevo-boton"
            onClick={() => {
              setFormError(null);
              setFormMode({ kind: "create" });
            }}
          >
            Nuevo cliente
          </button>
        )}

        {formMode.kind !== "closed" && (
          <ClienteForm
            cliente={formMode.kind === "edit" ? formMode.cliente : null}
            submitting={formSubmitting}
            onCancel={() => {
              setFormError(null);
              setFormMode({ kind: "closed" });
            }}
            onSubmit={handleFormSubmit}
          />
        )}
        {formError && <p className="agent-config-error">{formError}</p>}
      </section>

      <section>
        {deleteError && <p className="agent-config-error">{deleteError}</p>}
        {clientesQuery.isLoading && <p className="page-message">Cargando clientes…</p>}
        {clientesQuery.isError && (
          <p className="page-message">No se pudieron cargar los clientes.</p>
        )}
        {clientesQuery.data && (
          <ClientesTable
            clientes={clientesQuery.data}
            deletingId={deletingId}
            onEdit={(cliente) => {
              setFormError(null);
              setFormMode({ kind: "edit", cliente });
            }}
            onDelete={(cliente) => void handleDelete(cliente)}
          />
        )}
      </section>
    </div>
  );
}
