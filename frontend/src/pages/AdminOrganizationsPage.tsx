import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import { useAuth } from "../auth/AuthContext";
import {
  AGENT_TYPES,
  AGENT_TYPE_LABELS,
  type Organization,
  type OrganizationAgentToggles,
} from "../types/adminOrganization";

const ADMIN_ORGANIZATIONS_QUERY_KEY = ["admin", "organizations"] as const;

// Fase 4 — panel de admin de plataforma: listar organizaciones y
// habilitar/deshabilitar sus agentes de IA. Sin lógica funcional de ningún
// agente todavía (eso es Fase 5) — esto solo escribe el toggle.
export function AdminOrganizationsPage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [nombreNuevaOrg, setNombreNuevaOrg] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const organizationsQuery = useQuery({
    queryKey: ADMIN_ORGANIZATIONS_QUERY_KEY,
    queryFn: ({ signal }) =>
      request<OrganizationAgentToggles[]>("/admin/organizations", { getAccessToken, signal }),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      request<Organization>("/admin/organizations", {
        method: "POST",
        body: { name },
        getAccessToken,
      }),
    onSuccess: () => {
      setNombreNuevaOrg("");
      void queryClient.invalidateQueries({ queryKey: ADMIN_ORGANIZATIONS_QUERY_KEY });
    },
  });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!nombreNuevaOrg.trim()) return;
    setCreateError(null);
    try {
      await createMutation.mutateAsync(nombreNuevaOrg.trim());
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "No se pudo crear la organización.");
    }
  }

  const toggleMutation = useMutation({
    mutationFn: ({
      organizationId,
      agentType,
      enabled,
    }: {
      organizationId: string;
      agentType: string;
      enabled: boolean;
    }) =>
      request<void>(`/admin/organizations/${organizationId}/agent-toggles/${agentType}`, {
        method: "PUT",
        body: { enabled },
        getAccessToken,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_ORGANIZATIONS_QUERY_KEY });
    },
  });

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Organizaciones</h1>
        <button type="button" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </header>

      <form className="admin-create-org-form" onSubmit={(e) => void handleCreate(e)}>
        <label htmlFor="nueva-org-nombre" className="sr-only">
          Nueva organización
        </label>
        <input
          id="nueva-org-nombre"
          type="text"
          required
          value={nombreNuevaOrg}
          onChange={(e) => setNombreNuevaOrg(e.target.value)}
          placeholder="Nombre de la organización"
        />
        <button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creando…" : "Crear"}
        </button>
      </form>
      {createError && <p className="agent-config-error">{createError}</p>}

      {organizationsQuery.isLoading && <p className="page-message">Cargando organizaciones…</p>}
      {organizationsQuery.isError && (
        <p className="page-message">No se pudieron cargar las organizaciones.</p>
      )}

      {organizationsQuery.data && (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Organización</th>
              {AGENT_TYPES.map((agentType) => (
                <th key={agentType}>{AGENT_TYPE_LABELS[agentType]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {organizationsQuery.data.map((org) => (
              <tr key={org.organizationId}>
                <td>{org.organizationName}</td>
                {AGENT_TYPES.map((agentType) => (
                  <td key={agentType}>
                    <label className="admin-toggle">
                      <input
                        type="checkbox"
                        checked={org.toggles[agentType]}
                        disabled={toggleMutation.isPending}
                        onChange={(e) =>
                          toggleMutation.mutate({
                            organizationId: org.organizationId,
                            agentType,
                            enabled: e.target.checked,
                          })
                        }
                      />
                      <span className="sr-only">
                        {AGENT_TYPE_LABELS[agentType]} para {org.organizationName}
                      </span>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
            {organizationsQuery.data.length === 0 && (
              <tr>
                <td colSpan={AGENT_TYPES.length + 1} className="page-message">
                  Todavía no hay organizaciones.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
