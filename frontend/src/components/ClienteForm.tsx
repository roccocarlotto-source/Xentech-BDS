import { useState, type FormEvent } from "react";
import type { Cliente } from "../types/cliente";

// Mismos campos que la importación masiva (ver types/importClientes.ts) --
// esto es la otra puerta de entrada para cargar/editar UN cliente a mano,
// que hasta ahora no existía (solo se podía importar en lote o, para
// editar/borrar, pegarle directo a la API).
export interface ClienteFormInput {
  nombre: string;
  telefono?: string;
  email?: string;
  notas?: string;
  cuotaMonto?: number;
  cuotaPeriodicidad?: "MENSUAL";
  cuotaUltimoPago?: string;
}

interface ClienteFormProps {
  // undefined/null = alta de un cliente nuevo; con datos = edición.
  cliente?: Cliente | null;
  onSubmit: (input: ClienteFormInput) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

// La periodicidad de la cuota no se pregunta en el formulario: "MENSUAL" es
// la única que existe hoy (cuotaPeriodicidadSchema en el backend) -- se
// asigna sola en cuanto se carga una fecha de último pago. Si en el futuro
// se suma otra periodicidad, acá hay que agregar un <select>.
export function ClienteForm({ cliente, onSubmit, onCancel, submitting }: ClienteFormProps) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? "");
  const [telefono, setTelefono] = useState(cliente?.telefono ?? "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [notas, setNotas] = useState(cliente?.notas ?? "");
  const [cuotaMonto, setCuotaMonto] = useState(cliente?.cuotaMonto ?? "");
  const [cuotaUltimoPago, setCuotaUltimoPago] = useState(
    cliente?.cuotaUltimoPago ? cliente.cuotaUltimoPago.slice(0, 10) : "",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;

    const montoTrimmed = cuotaMonto.trim();
    if (montoTrimmed && Number.isNaN(Number(montoTrimmed))) {
      setLocalError("El monto de la cuota tiene que ser un número.");
      return;
    }
    setLocalError(null);

    await onSubmit({
      nombre: nombre.trim(),
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      notas: notas.trim() || undefined,
      cuotaMonto: montoTrimmed ? Number(montoTrimmed) : undefined,
      cuotaPeriodicidad: cuotaUltimoPago ? "MENSUAL" : undefined,
      cuotaUltimoPago: cuotaUltimoPago || undefined,
    });
  }

  return (
    <form className="cliente-form" onSubmit={(e) => void handleSubmit(e)}>
      <div className="cliente-form-grid">
        <label>
          Nombre
          <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>
        <label>
          Teléfono
          <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </label>
        <label>
          Correo electrónico
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Monto de la cuota
          <input
            type="text"
            inputMode="decimal"
            value={cuotaMonto}
            onChange={(e) => setCuotaMonto(e.target.value)}
          />
        </label>
        <label>
          Fecha del último pago
          <input
            type="date"
            value={cuotaUltimoPago}
            onChange={(e) => setCuotaUltimoPago(e.target.value)}
          />
        </label>
        <label className="cliente-form-notas">
          Notas
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
        </label>
      </div>
      {localError && <p className="agent-config-error">{localError}</p>}
      <div className="cliente-form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? "Guardando…" : cliente ? "Guardar cambios" : "Agregar cliente"}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
