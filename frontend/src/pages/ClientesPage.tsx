import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import { useAuth } from "../auth/AuthContext";
import type { Cliente, ClientesStats } from "../types/cliente";
import { ClientesTable } from "../components/ClientesTable";
import { StatsDonut } from "../components/StatsDonut";

export function ClientesPage() {
  const { logout, me } = useAuth();

  const clientesQuery = useQuery({
    queryKey: ["clientes"],
    queryFn: ({ signal }) => request<Cliente[]>("/clientes", { getAccessToken, signal }),
  });

  const statsQuery = useQuery({
    queryKey: ["clientes", "stats"],
    queryFn: ({ signal }) => request<ClientesStats>("/clientes/stats", { getAccessToken, signal }),
  });

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
        {clientesQuery.isLoading && <p className="page-message">Cargando clientes…</p>}
        {clientesQuery.isError && (
          <p className="page-message">No se pudieron cargar los clientes.</p>
        )}
        {clientesQuery.data && <ClientesTable clientes={clientesQuery.data} />}
      </section>
    </div>
  );
}
