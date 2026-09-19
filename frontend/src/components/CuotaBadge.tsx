import type { CuotaResumen } from "../types/cliente";

// Colores de estado (dataviz skill: "status palette", fija, con
// icono/etiqueta — nunca color solo): al día = good, atrasado = critical,
// sin datos = neutral. Los mismos tres colores que usa el gráfico de dona.
const LABELS: Record<CuotaResumen["estado"], string> = {
  AL_DIA: "Al día",
  ATRASADO: "Atrasado",
  SIN_DATOS: "Sin datos",
};

export function CuotaBadge({ cuota }: { cuota: CuotaResumen }) {
  const label =
    cuota.estado === "ATRASADO"
      ? `${LABELS.ATRASADO} (${cuota.diasAtraso}d)`
      : LABELS[cuota.estado];

  return <span className={`cuota-badge cuota-badge--${cuota.estado.toLowerCase()}`}>{label}</span>;
}
