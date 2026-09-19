import type { Cliente } from "../types/cliente";
import { NotasCell } from "./NotasCell";
import { CuotaBadge } from "./CuotaBadge";

export function ClientesTable({ clientes }: { clientes: Cliente[] }) {
  if (clientes.length === 0) {
    return <p className="page-message">Todavía no hay clientes cargados.</p>;
  }

  return (
    <table className="clientes-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Teléfono</th>
          <th>Correo electrónico</th>
          <th>Cuota</th>
          <th>Notas</th>
        </tr>
      </thead>
      <tbody>
        {clientes.map((c) => (
          <tr key={c.id}>
            <td>{c.nombre}</td>
            <td>{c.telefono ?? "—"}</td>
            <td>{c.email ?? "—"}</td>
            <td>
              <CuotaBadge cuota={c.cuota} />
            </td>
            <td>
              <NotasCell notas={c.notas} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
