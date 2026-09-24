import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import { useAuth } from "../auth/AuthContext";
import { Estrellas } from "../components/Estrellas";
import type { Cliente } from "../types/cliente";
import type { LinkResena, ResenaModeracion, ResenaPanel } from "../types/resena";

// Etapa 3 de docs/seguimiento-resenas-diseno.md: panel de reseñas de la
// organización. Cualquier usuario genera links y ve las reseñas; moderar
// es solo del admin (mismo gate que el backend).
//
// Post-moderación (§5 del diseño): toda reseña se publica sola y se
// rechaza SOLO por spam o contenido inapropiado -- nunca por ser negativa.

type Filtro = "" | ResenaModeracion;

const RESENAS_QUERY_KEY = ["resenas"] as const;

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY");
}

export function ResenasPage() {
  const { logout, me } = useAuth();
  const esAdmin = me?.role === "ADMIN" && !me.isPlatformAdmin;
  const queryClient = useQueryClient();

  const [filtro, setFiltro] = useState<Filtro>("");
  const [clienteId, setClienteId] = useState("");
  const [link, setLink] = useState<LinkResena | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [rechazando, setRechazando] = useState<{ id: string; motivo: string } | null>(null);

  const clientesQuery = useQuery({
    queryKey: ["clientes"],
    queryFn: ({ signal }) => request<Cliente[]>("/clientes", { getAccessToken, signal }),
  });

  const resenasQuery = useQuery({
    queryKey: [...RESENAS_QUERY_KEY, filtro],
    queryFn: ({ signal }) =>
      request<ResenaPanel[]>(filtro ? `/resenas?moderacion=${filtro}` : "/resenas", {
        getAccessToken,
        signal,
      }),
  });

  const linkMutation = useMutation({
    mutationFn: (id: string) =>
      request<LinkResena>("/resenas/links", {
        method: "POST",
        body: { clienteId: id },
        getAccessToken,
      }),
    onSuccess: (data) => {
      setLink(data);
      setCopiado(false);
    },
  });

  const moderarMutation = useMutation({
    mutationFn: ({
      id,
      moderacion,
      motivo,
    }: {
      id: string;
      moderacion: ResenaModeracion;
      motivo?: string;
    }) =>
      request<void>(`/resenas/${id}/moderacion`, {
        method: "PATCH",
        body: { moderacion, motivo },
        getAccessToken,
      }),
    onSuccess: () => {
      setRechazando(null);
      void queryClient.invalidateQueries({ queryKey: RESENAS_QUERY_KEY });
    },
  });

  const urlLink = link ? `${window.location.origin}/r/${link.token}` : "";

  function handleGenerar(e: FormEvent) {
    e.preventDefault();
    if (clienteId) linkMutation.mutate(clienteId);
  }

  async function handleCopiar() {
    try {
      await navigator.clipboard.writeText(urlLink);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  function handleConfirmarRechazo(e: FormEvent) {
    e.preventDefault();
    if (!rechazando || !rechazando.motivo.trim()) return;
    moderarMutation.mutate({
      id: rechazando.id,
      moderacion: "RECHAZADA",
      motivo: rechazando.motivo.trim(),
    });
  }

  const errorModerar =
    moderarMutation.error instanceof ApiError
      ? moderarMutation.error.message
      : moderarMutation.error
        ? "No se pudo moderar la reseña."
        : null;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Reseñas</h1>
        <div className="agent-config-header-actions">
          <Link to="/">Volver a clientes</Link>
          <button type="button" onClick={() => void logout()}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <section className="resenas-generar">
        <h2>Pedir una reseña</h2>
        <form onSubmit={handleGenerar}>
          <label>
            Cliente
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Elegí un cliente…</option>
              {clientesQuery.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!clienteId || linkMutation.isPending}>
            {linkMutation.isPending ? "Generando…" : "Generar link"}
          </button>
        </form>
        {linkMutation.isError && <p className="import-error">No se pudo generar el link.</p>}
        {link && (
          <div className="resenas-link">
            <input readOnly value={urlLink} aria-label="Link de reseña" />
            <button type="button" onClick={() => void handleCopiar()}>
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <p className="agent-config-hint">
              Mandale este link al cliente. Vence el {formatearFecha(link.venceEn)} y sirve para una
              sola reseña. Por seguridad no queda guardado: si lo perdés, generá uno nuevo.
            </p>
          </div>
        )}
      </section>

      <section>
        <div className="resenas-filtro">
          <label>
            Mostrar
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
              <option value="">Todas</option>
              <option value="APROBADA">Publicadas</option>
              <option value="RECHAZADA">Rechazadas</option>
            </select>
          </label>
        </div>

        <p className="agent-config-hint">
          Las reseñas se publican solas. Rechazá únicamente spam o contenido inapropiado: una reseña
          negativa legítima tiene que quedar publicada.
        </p>

        {errorModerar && <p className="import-error">{errorModerar}</p>}
        {resenasQuery.isLoading && <p className="page-message">Cargando reseñas…</p>}
        {resenasQuery.isError && <p className="page-message">No se pudieron cargar las reseñas.</p>}

        {resenasQuery.data && (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Calificación</th>
                <th>Comentario</th>
                <th>Estado</th>
                {esAdmin && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {resenasQuery.data.map((r) => (
                <tr key={r.id}>
                  <td>{formatearFecha(r.createdAt)}</td>
                  <td>
                    {r.cliente.nombre}
                    <div className="resenas-figura">
                      {r.anonimo ? "Publicada como anónimo" : `Publicada como ${r.nombreVisible}`}
                    </div>
                  </td>
                  <td>
                    <Estrellas valor={r.estrellas} />
                  </td>
                  <td>{r.comentario ?? <span className="notas-empty">Sin comentario</span>}</td>
                  <td>
                    {r.moderacion === "APROBADA" ? "Publicada" : "Rechazada"}
                    {r.moderacion === "RECHAZADA" && r.motivoModeracion && (
                      <div className="resenas-figura">Motivo: {r.motivoModeracion}</div>
                    )}
                  </td>
                  {esAdmin && (
                    <td>
                      {r.moderacion === "APROBADA" ? (
                        rechazando?.id === r.id ? (
                          <form className="resenas-rechazo" onSubmit={handleConfirmarRechazo}>
                            <input
                              aria-label="Motivo del rechazo"
                              placeholder="Motivo (spam, contenido inapropiado…)"
                              value={rechazando.motivo}
                              maxLength={500}
                              onChange={(e) => setRechazando({ id: r.id, motivo: e.target.value })}
                            />
                            <button
                              type="submit"
                              disabled={!rechazando.motivo.trim() || moderarMutation.isPending}
                            >
                              Confirmar
                            </button>
                            <button type="button" onClick={() => setRechazando(null)}>
                              Cancelar
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRechazando({ id: r.id, motivo: "" })}
                          >
                            Rechazar
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          disabled={moderarMutation.isPending}
                          onClick={() =>
                            moderarMutation.mutate({ id: r.id, moderacion: "APROBADA" })
                          }
                        >
                          Volver a publicar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {resenasQuery.data.length === 0 && (
                <tr>
                  <td colSpan={esAdmin ? 6 : 5} className="page-message">
                    Todavía no hay reseñas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
