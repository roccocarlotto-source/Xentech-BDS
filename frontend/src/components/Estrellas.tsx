// Visualización de 1 a 5 estrellas (solo lectura).
export function Estrellas({ valor }: { valor: number }) {
  return (
    <span className="estrellas" role="img" aria-label={`${valor} de 5 estrellas`}>
      {"★".repeat(valor)}
      <span className="estrellas-vacias">{"★".repeat(5 - valor)}</span>
    </span>
  );
}
