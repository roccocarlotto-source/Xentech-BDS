import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import {
  CLASIFICACION_LABELS,
  ESTADO_LABELS,
  type PresupuestoEnPanel,
  type ResultadoSolicitudResena,
} from "../types/panelSeguimiento";

// Etapa 7, parte 2 (§6.6 "Panel interno"): dónde una persona ve qué pasó
// con cada presupuesto y decide si hace algo.
//
// El botón "Solicitar reseña" implementa la decisión de Rocco del
// 2026-09-26: el link sale automático, pero recién cuando una persona lo
// habilita. La IA marca el presupuesto como aceptado; el envío lo dispara
// alguien. Así una clasificación equivocada nunca termina en un pedido de
// reseña a quien no aceptó nada.

const QUERY_KEY = ["seguimiento", "presupuestos"] as const;

function formatearMonto(monto: string | null, moneda: string | null): string {
  if (monto === null) return "—";
  return `${moneda ?? ""} ${monto}`.trim();
}

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-UY");
}

export function PanelSeguimientoPage() {
  const queryClient = useQueryClient();
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [resultado, setResultado] = useState<{
    presupuestoId: string;
    datos: ResultadoSolicitudResena;
  } | null>(null);

  const presupuestosQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) =>
      request<PresupuestoEnPanel[]>("/seguimiento/presupuestos", { getAccessToken, signal }),
  });

  const solicitarMutation = useMutation({
    mutationFn: (presupuestoId: string) =>
      request<ResultadoSolicitudResena>(
        `/seguimiento/presupuestos/${presupuestoId}/solicitar-resena`,
        { method: "POST", getAccessToken },
      ),
    onSuccess: (datos, presupuestoId) => {
      setResultado({ presupuestoId, datos });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  if (presupuestosQuery.isLoading) return <div className="page-message">Cargando…</div>;

  if (presupuestosQuery.isError || !presupuestosQuery.data) {
    const err = presupuestosQuery.error;
    const mensaje =
      err instanceof ApiError && err.status === 404
        ? "El módulo de seguimiento y reseñas no está habilitado para tu organización."
        : "No se pudieron cargar los presupuestos.";
    return <div className="page-message">{mensaje}</div>;
  }

  const todos = presupuestosQuery.data;
  const pendientes = todos.filter((p) => p.ultimaRespuesta?.requiereVendedor);
  const visibles = soloPendientes ? pendientes : todos;

  const errorSolicitar =
    solicitarMutation.error instanceof ApiError
      ? solicitarMutation.error.message
      : solicitarMutation.error
        ? "No se pudo pedir la reseña."
        : null;

  return (
    <div className="import-page">
      <header className="import-header">
        <h1>Seguimiento</h1>
        <Link to="/">Volver a clientes</Link>
      </header>

      <label className="agent-config-checkbox">
        <input
          type="checkbox"
          checked={soloPendientes}
          onChange={(e) => setSoloPendientes(e.target.checked)}
        />
        Solo los que necesitan que alguien responda ({pendientes.length})
      </label>

      {errorSolicitar && <p className="import-error">{errorSolicitar}</p>}

      {visibles.length === 0 ? (
        <p className="page-message">
          {soloPendientes
            ? "Nada pendiente: ninguna respuesta necesita que intervengas."
            : "Todavía no hay presupuestos cargados."}
        </p>
      ) : (
        <table className="clientes-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Presupuesto</th>
              <th>Monto</th>
              <th>Estado</th>
              <th>Última respuesta</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr
                key={p.id}
                className={p.ultimaRespuesta?.requiereVendedor ? "fila-atencion" : undefined}
              >
                <td>
                  {p.cliente.nombre}
                  {p.cliente.personaContacto && (
                    <span className="seguimiento-contacto"> · {p.cliente.personaContacto}</span>
                  )}
                </td>
                <td>{p.descripcion ?? "—"}</td>
                <td>{formatearMonto(p.monto, p.moneda)}</td>
                <td>{ESTADO_LABELS[p.estado]}</td>
                <td>
                  {p.ultimaRespuesta ? (
                    <>
                      <div>
                        {p.ultimaRespuesta.clasificacionIa
                          ? CLASIFICACION_LABELS[p.ultimaRespuesta.clasificacionIa]
                          : "Sin clasificar todavía"}
                        {p.ultimaRespuesta.requiereVendedor && (
                          <strong className="seguimiento-atencion"> · te toca</strong>
                        )}
                      </div>
                      <div className="seguimiento-resumen">
                        {p.ultimaRespuesta.resumenIa ?? p.ultimaRespuesta.contenido.slice(0, 120)}
                      </div>
                      <div className="seguimiento-fecha">
                        {formatearFecha(p.ultimaRespuesta.fecha)}
                      </div>
                    </>
                  ) : (
                    <span className="seguimiento-fecha">Sin respuestas</span>
                  )}
                </td>
                <td>
                  {p.estado === "ACEPTADO" && !p.resenaSolicitada && (
                    <button
                      type="button"
                      onClick={() => solicitarMutation.mutate(p.id)}
                      disabled={solicitarMutation.isPending}
                    >
                      Solicitar reseña
                    </button>
                  )}
                  {p.resenaSolicitada && <span className="seguimiento-fecha">Reseña pedida</span>}
                  {resultado?.presupuestoId === p.id && (
                    <p className="seguimiento-resultado">
                      {resultado.datos.emailEnviado ? (
                        "Link enviado por email."
                      ) : (
                        <>
                          No se pudo mandar el email ({resultado.datos.motivo}). Copiá el link:{" "}
                          <code>{`${window.location.origin}/r/${resultado.datos.token}`}</code>
                        </>
                      )}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
