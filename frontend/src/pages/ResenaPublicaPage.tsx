import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { ApiError, request } from "../lib/api";
import { COMENTARIO_MAX, type FormularioResena } from "../types/resena";

// Página pública /r/:token (§6.1 de docs/seguimiento-resenas-diseno.md): la
// abre el cliente final desde el link que le mandaron, sin cuenta ni login.
// Todo pasa por el backend (POST /api/public/resenas/...), el token viaja
// en el body.

const sinSesion = async () => null;

const MENSAJE_GENERICO =
  "Este link de reseña ya no está disponible. Puede que haya vencido o que ya se haya usado.";

export function ResenaPublicaPage() {
  const { token = "" } = useParams();
  const [comoFigura, setComoFigura] = useState<"nombre" | "anonimo" | null>(null);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");

  const formularioQuery = useQuery({
    queryKey: ["resena-publica", token],
    queryFn: ({ signal }) =>
      request<FormularioResena>("/public/resenas/formulario", {
        method: "POST",
        body: { token },
        getAccessToken: sinSesion,
        signal,
      }),
    retry: false,
    staleTime: Infinity,
  });

  const publicarMutation = useMutation({
    mutationFn: () =>
      request<{ ok: true }>("/public/resenas", {
        method: "POST",
        body: {
          token,
          anonimo: comoFigura === "anonimo",
          estrellas,
          comentario: comentario.trim() || null,
        },
        getAccessToken: sinSesion,
      }),
  });

  const puedeEnviar = comoFigura !== null && estrellas >= 1 && !publicarMutation.isPending;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (puedeEnviar) publicarMutation.mutate();
  }

  if (formularioQuery.isLoading) {
    return <div className="page-message">Cargando…</div>;
  }

  if (publicarMutation.isSuccess) {
    return (
      <main className="resena-publica">
        <div className="resena-publica-card">
          <h1>¡Gracias por tu reseña!</h1>
          <p>Tu opinión nos ayuda a mejorar.</p>
        </div>
      </main>
    );
  }

  if (formularioQuery.isError || !formularioQuery.data) {
    const err = formularioQuery.error;
    const mensaje = err instanceof ApiError && err.status === 404 ? err.message : MENSAJE_GENERICO;
    return (
      <main className="resena-publica">
        <div className="resena-publica-card">
          <h1>Link no disponible</h1>
          <p>{mensaje}</p>
        </div>
      </main>
    );
  }

  const { organizacion, nombreCliente } = formularioQuery.data;
  const errorPublicar =
    publicarMutation.error instanceof ApiError
      ? publicarMutation.error.message
      : publicarMutation.error
        ? "No se pudo enviar la reseña. Probá de nuevo."
        : null;

  return (
    <main className="resena-publica">
      <form className="resena-publica-card" onSubmit={handleSubmit}>
        <h1>¿Cómo fue tu experiencia con {organizacion}?</h1>

        <fieldset>
          <legend>Tu calificación</legend>
          <div className="estrellas-input">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={n <= estrellas ? "activa" : undefined}>
                <input
                  type="radio"
                  name="estrellas"
                  value={n}
                  aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
                  checked={estrellas === n}
                  onChange={() => setEstrellas(n)}
                />
                <span aria-hidden="true">★</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="resena-publica-comentario">
          Comentario (opcional)
          <textarea
            value={comentario}
            maxLength={COMENTARIO_MAX}
            rows={4}
            onChange={(e) => setComentario(e.target.value)}
          />
          <span className="resena-publica-contador">
            {comentario.length}/{COMENTARIO_MAX}
          </span>
        </label>

        <fieldset>
          <legend>¿Cómo querés figurar?</legend>
          <label className="resena-publica-opcion">
            <input
              type="radio"
              name="como-figura"
              checked={comoFigura === "nombre"}
              onChange={() => setComoFigura("nombre")}
            />
            Publicar como {nombreCliente}
          </label>
          <label className="resena-publica-opcion">
            <input
              type="radio"
              name="como-figura"
              checked={comoFigura === "anonimo"}
              onChange={() => setComoFigura("anonimo")}
            />
            Publicar como anónimo
          </label>
        </fieldset>

        {errorPublicar && <p className="import-error">{errorPublicar}</p>}

        <button type="submit" disabled={!puedeEnviar}>
          {publicarMutation.isPending ? "Enviando…" : "Enviar reseña"}
        </button>
      </form>
    </main>
  );
}
