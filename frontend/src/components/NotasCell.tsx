import { useState } from "react";

const PREVIEW_WORD_COUNT = 6;

function preview(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= PREVIEW_WORD_COUNT) return text;
  return `${words.slice(0, PREVIEW_WORD_COUNT).join(" ")}…`;
}

// Campo "notas" del MVP: colapsado por defecto mostrando las primeras
// palabras, con un botón para expandir/contraer el texto completo — pedido
// explícito de Rocco en el brief del proyecto.
export function NotasCell({ notas }: { notas: string | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!notas || !notas.trim()) {
    return <span className="notas-empty">—</span>;
  }

  const isLong = notas.trim().split(/\s+/).length > PREVIEW_WORD_COUNT;

  return (
    <div className="notas-cell">
      <span>{expanded || !isLong ? notas : preview(notas)}</span>
      {isLong && (
        <button
          type="button"
          className="notas-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Contraer" : "Ampliar"}
        </button>
      )}
    </div>
  );
}
