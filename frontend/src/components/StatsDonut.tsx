import type { ClientesStats } from "../types/cliente";

// dataviz skill: paleta de estado (fija, no temática) — al día = good,
// atrasado = critical, sin datos = tinta muted. "Sin datos" se cuenta en el
// total pero no es ni al día ni atrasado, así que va con su propio color en
// vez de mezclarse en alguno de los otros dos.
const COLORS = {
  alDia: "#0ca30c",
  atrasado: "#d03b3b",
  sinDatos: "#898781",
} as const;

const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const GAP_PX = 3; // separación entre segmentos (mark spec: 2px surface gap, redondeado a 3 para que se note al trazo)

interface Segment {
  key: "alDia" | "atrasado" | "sinDatos";
  label: string;
  value: number;
  color: string;
}

export function StatsDonut({ stats }: { stats: ClientesStats }) {
  const allSegments: Segment[] = [
    { key: "alDia", label: "Al día", value: stats.alDia, color: COLORS.alDia },
    { key: "atrasado", label: "Atrasados", value: stats.atrasado, color: COLORS.atrasado },
    { key: "sinDatos", label: "Sin datos", value: stats.sinDatos, color: COLORS.sinDatos },
  ];
  const segments = allSegments.filter((s) => s.value > 0);

  let offset = 0;

  return (
    <div className="stats-donut">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Clientes por estado de cuota"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#e1e0d9"
          strokeWidth={STROKE}
        />
        {stats.total > 0 &&
          segments.map((seg) => {
            const rawLength = (seg.value / stats.total) * CIRCUMFERENCE;
            const length = Math.max(rawLength - GAP_PX, 0);
            const dasharray = `${length} ${CIRCUMFERENCE - length}`;
            const dashoffset = -offset;
            offset += rawLength;
            return (
              <circle
                key={seg.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={seg.color}
                strokeWidth={STROKE}
                strokeDasharray={dasharray}
                strokeDashoffset={dashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            );
          })}
        <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" className="stats-donut-total">
          {stats.total}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 16}
          textAnchor="middle"
          className="stats-donut-total-label"
        >
          clientes
        </text>
      </svg>
      <ul className="stats-donut-legend">
        <li>
          <span className="legend-dot" style={{ background: COLORS.alDia }} />
          Al día <strong>{stats.alDia}</strong>
        </li>
        <li>
          <span className="legend-dot" style={{ background: COLORS.atrasado }} />
          Atrasados <strong>{stats.atrasado}</strong>
        </li>
        <li>
          <span className="legend-dot" style={{ background: COLORS.sinDatos }} />
          Sin datos <strong>{stats.sinDatos}</strong>
        </li>
      </ul>
    </div>
  );
}
