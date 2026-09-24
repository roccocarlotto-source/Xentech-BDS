import type { Cliente } from "../types/cliente";
import { NotasCell } from "./NotasCell";
import { CuotaBadge } from "./CuotaBadge";

interface ClientesTableProps {
  clientes: Cliente[];
  onEdit: (cliente: Cliente) => void;
  onDelete: (cliente: Cliente) => void;
  deletingId: string | null;
}

export function ClientesTable({ clientes, onEdit, onDelete, deletingId }: ClientesTableProps) {
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
          <th>
            <span className="sr-only">Acciones</span>
          </th>
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
            <td className="clientes-table-actions">
              <button type="button" onClick={() => onEdit(c)}>
                Editar
              </button>
              <button
                type="button"
                className="clientes-table-delete"
                disabled={deletingId === c.id}
                onClick={() => onDelete(c)}
              >
                {deletingId === c.id ? "Eliminando…" : "Eliminar"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
