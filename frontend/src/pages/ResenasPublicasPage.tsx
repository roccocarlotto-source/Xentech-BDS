import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { request } from "../lib/api";
import { Estrellas } from "../components/Estrellas";
import type { ListadoResenasPublico } from "../types/resena";

// Página pública /o/:slug/resenas: listado de reseñas aprobadas de una
// organización (§6.1). La web de la empresa puede enlazarla, o consumir
// directo el mismo endpoint (GET /api/public/organizaciones/:slug/resenas,
// con CORS abierto) para mostrarlas con su propio diseño.

const sinSesion = async () => null;

export function ResenasPublicasPage() {
  const { slug = "" } = useParams();
  const [pagina, setPagina] = useState(1);

  const listadoQuery = useQuery({
    queryKey: ["resenas-publicas", slug, pagina],
    queryFn: ({ signal }) =>
      request<ListadoResenasPublico>(
        `/public/organizaciones/${encodeURIComponent(slug)}/resenas?pagina=${pagina}`,
        { getAccessToken: sinSesion, signal },
      ),
    retry: false,
  });

  if (listadoQuery.isLoading) {
    return <div className="page-message">Cargando…</div>;
  }

  if (listadoQuery.isError || !listadoQuery.data) {
    return <div className="page-message">No encontramos reseñas para mostrar.</div>;
  }

  const { organizacion, total, promedio, resenas, totalPaginas } = listadoQuery.data;

  return (
    <main className="resenas-publicas">
      <h1>Reseñas de {organizacion}</h1>
      {total === 0 ? (
        <p className="page-message">Todavía no hay reseñas.</p>
      ) : (
        <p className="resenas-publicas-resumen">
          {promedio !== null && <Estrellas valor={Math.round(promedio)} />}{" "}
          <strong>{promedio?.toFixed(1)}</strong> · {total} {total === 1 ? "reseña" : "reseñas"}
        </p>
      )}

      <ul className="resenas-publicas-lista">
        {resenas.map((r) => (
          <li key={r.id}>
            <div className="resenas-publicas-cabecera">
              <Estrellas valor={r.estrellas} />
              <span>{r.nombre ?? "Anónimo"}</span>
              <span className="resenas-figura">
                {new Date(r.fecha).toLocaleDateString("es-UY")}
              </span>
            </div>
            {r.comentario && <p>{r.comentario}</p>}
          </li>
        ))}
      </ul>

      {totalPaginas > 1 && (
        <nav className="resenas-publicas-paginas">
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
            Anteriores
          </button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina(pagina + 1)}
          >
            Siguientes
          </button>
        </nav>
      )}
    </main>
  );
}
