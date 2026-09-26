import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ApiError, request } from "../lib/api";
import { getAccessToken } from "../auth/getAccessToken";
import type {
  ConfigSeguimiento,
  ConfigSeguimientoInput,
  PlantillaEmail,
  PlantillaWhatsapp,
} from "../types/configSeguimiento";

// Etapa 8 de docs/seguimiento-resenas-diseno.md: el admin de la propia
// organización configura su seguimiento. Hasta ahora esto no existía y el
// motor corría siempre con los defaults del schema, sin forma de editar las
// plantillas de los emails.
//
// El backend valida todo de nuevo (upsertConfigSeguimientoSchema): lo de acá
// es para no hacer el viaje y para explicar las reglas antes de guardar.

const QUERY_KEY = ["config-seguimiento"] as const;

function intervalosATexto(dias: number[]): string {
  return dias.join(", ");
}

// "2, 7, 15" -> [2, 7, 15]. Devuelve null si hay algo que no es un entero
// positivo: así el error se muestra antes de mandar.
function textoAIntervalos(texto: string): number[] | null {
  const partes = texto
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (partes.length === 0) return null;

  const numeros = partes.map(Number);
  if (numeros.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) return null;
  return numeros;
}

// El componente que carga, separado del formulario a propósito: así el
// estado del form se inicializa DESDE props con useState, sin un useEffect
// que lo sincronice. Un setState dentro de un efecto dispara renders en
// cascada (el lint del frontend lo marca) y además es la misma convención
// que ImportPresupuestosPage, que precarga en la reacción a la respuesta y
// no en un efecto.
export function ConfigSeguimientoPage() {
  const configQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) =>
      request<ConfigSeguimiento>("/config-seguimiento", { getAccessToken, signal }),
  });

  if (configQuery.isLoading) return <div className="page-message">Cargando…</div>;

  if (configQuery.isError || !configQuery.data) {
    const err = configQuery.error;
    const mensaje =
      err instanceof ApiError && err.status === 404
        ? "El módulo de seguimiento y reseñas no está habilitado para tu organización."
        : "No se pudo cargar la configuración.";
    return <div className="page-message">{mensaje}</div>;
  }

  return <ConfigSeguimientoForm inicial={configQuery.data} />;
}

function ConfigSeguimientoForm({ inicial }: { inicial: ConfigSeguimiento }) {
  const queryClient = useQueryClient();

  const [intervalos, setIntervalos] = useState(intervalosATexto(inicial.intervalosDias));
  const [maxIntentos, setMaxIntentos] = useState(inicial.maxIntentos);
  const [horaInicio, setHoraInicio] = useState(inicial.horaInicioEnvio);
  const [horaFin, setHoraFin] = useState(inicial.horaFinEnvio);
  const [zonaHoraria, setZonaHoraria] = useState(inicial.zonaHoraria);
  const [diasToken, setDiasToken] = useState(inicial.diasValidezTokenResena);
  const [plantillasEmail, setPlantillasEmail] = useState<PlantillaEmail[]>(
    inicial.plantillas.EMAIL,
  );
  const [plantillasWhatsapp, setPlantillasWhatsapp] = useState<PlantillaWhatsapp[]>(
    inicial.plantillas.WHATSAPP,
  );
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [personalizada, setPersonalizada] = useState(inicial.personalizada);

  const guardarMutation = useMutation({
    mutationFn: (input: ConfigSeguimientoInput) =>
      request<ConfigSeguimiento>("/config-seguimiento", {
        method: "PUT",
        body: input,
        getAccessToken,
      }),
    onSuccess: (config) => {
      queryClient.setQueryData(QUERY_KEY, config);
      setPersonalizada(config.personalizada);
    },
  });

  const pasos = textoAIntervalos(intervalos)?.length ?? 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const dias = textoAIntervalos(intervalos);
    if (!dias) {
      setErrorLocal(
        "Los intervalos tienen que ser números enteros entre 1 y 365, separados por comas.",
      );
      return;
    }
    if (dias.some((d, i) => i > 0 && d <= dias[i - 1])) {
      setErrorLocal("Los intervalos tienen que ir de menor a mayor, sin repetir.");
      return;
    }
    if (horaInicio >= horaFin) {
      setErrorLocal("La hora de inicio tiene que ser menor que la de fin.");
      return;
    }
    setErrorLocal(null);

    guardarMutation.mutate({
      intervalosDias: dias,
      maxIntentos,
      horaInicioEnvio: horaInicio,
      horaFinEnvio: horaFin,
      zonaHoraria: zonaHoraria.trim(),
      diasValidezTokenResena: diasToken,
      plantillas: {
        // Se recortan a la cantidad de pasos: el backend rechaza tener más
        // plantillas que intervalos.
        EMAIL: plantillasEmail.slice(0, dias.length),
        WHATSAPP: plantillasWhatsapp.slice(0, dias.length),
      },
    });
  }

  function editarEmail(indice: number, campo: keyof PlantillaEmail, valor: string) {
    setPlantillasEmail((actuales) => {
      const copia = [...actuales];
      while (copia.length <= indice) copia.push({ asunto: "", cuerpo: "" });
      copia[indice] = { ...copia[indice], [campo]: valor };
      return copia;
    });
  }

  function editarWhatsapp(indice: number, campo: keyof PlantillaWhatsapp, valor: string) {
    setPlantillasWhatsapp((actuales) => {
      const copia = [...actuales];
      while (copia.length <= indice) copia.push({ nombre: "", idioma: "es" });
      copia[indice] = { ...copia[indice], [campo]: valor };
      return copia;
    });
  }

  const errorGuardar =
    guardarMutation.error instanceof ApiError
      ? guardarMutation.error.message
      : guardarMutation.error
        ? "No se pudo guardar. Probá de nuevo."
        : null;

  return (
    <div className="import-page">
      <header className="import-header">
        <h1>Configuración del seguimiento</h1>
        <Link to="/">Volver</Link>
      </header>

      {!personalizada && (
        <p className="agent-config-hint">
          Todavía no guardaste una configuración propia. Lo que ves abajo no es un formulario vacío:
          son los valores con los que el seguimiento <strong>ya está funcionando</strong>.
        </p>
      )}

      <form className="agent-config-form" onSubmit={handleSubmit}>
        <fieldset className="agent-config-fieldset">
          <legend>Secuencia</legend>

          <label className="agent-config-field">
            Días de seguimiento
            <input value={intervalos} onChange={(e) => setIntervalos(e.target.value)} />
            <span className="agent-config-hint">
              Separados por comas, de menor a mayor. Se cuentan desde la fecha del presupuesto, no
              uno después del otro: <code>2, 7, 15</code> son los días 2, 7 y 15.
            </span>
          </label>

          <label className="agent-config-field">
            Máximo de intentos por envío
            <input
              type="number"
              min={1}
              max={10}
              value={maxIntentos}
              onChange={(e) => setMaxIntentos(Number(e.target.value))}
            />
            <span className="agent-config-hint">
              Cuántas veces se reintenta un envío que falló por un problema pasajero antes de darlo
              por perdido.
            </span>
          </label>
        </fieldset>

        <fieldset className="agent-config-fieldset">
          <legend>Horario de envío</legend>
          <div className="config-horario">
            <label className="agent-config-field">
              Desde
              <input
                type="number"
                min={0}
                max={23}
                value={horaInicio}
                onChange={(e) => setHoraInicio(Number(e.target.value))}
              />
            </label>
            <label className="agent-config-field">
              Hasta
              <input
                type="number"
                min={1}
                max={24}
                value={horaFin}
                onChange={(e) => setHoraFin(Number(e.target.value))}
              />
            </label>
          </div>
          <span className="agent-config-hint">
            En hora local. La hora de fin es exclusive: con 9 y 20, nada sale antes de las 9:00 ni
            desde las 20:00.
          </span>

          <label className="agent-config-field">
            Zona horaria
            <input value={zonaHoraria} onChange={(e) => setZonaHoraria(e.target.value)} />
            <span className="agent-config-hint">
              Nombre IANA, por ejemplo <code>America/Montevideo</code>.
            </span>
          </label>
        </fieldset>

        <fieldset className="agent-config-fieldset">
          <legend>Reseñas</legend>
          <label className="agent-config-field">
            Días de validez del link de reseña
            <input
              type="number"
              min={1}
              max={365}
              value={diasToken}
              onChange={(e) => setDiasToken(Number(e.target.value))}
            />
          </label>
        </fieldset>

        <fieldset className="agent-config-fieldset">
          <legend>Plantillas de email</legend>
          <p className="agent-config-hint">
            Una por paso. La que dejes vacía usa el texto genérico. La línea de baja («Respondé BAJA
            si no querés más mensajes») <strong>no va acá</strong>: la agrega el sistema a todos los
            emails, para que ninguna plantilla pueda omitirla.
          </p>
          {Array.from({ length: pasos }, (_, i) => (
            <div key={i} className="config-plantilla">
              <h3>Paso {i + 1}</h3>
              <label className="agent-config-field">
                Asunto
                <input
                  value={plantillasEmail[i]?.asunto ?? ""}
                  onChange={(e) => editarEmail(i, "asunto", e.target.value)}
                />
              </label>
              <label className="agent-config-field">
                Cuerpo
                <textarea
                  rows={4}
                  value={plantillasEmail[i]?.cuerpo ?? ""}
                  onChange={(e) => editarEmail(i, "cuerpo", e.target.value)}
                />
              </label>
            </div>
          ))}
        </fieldset>

        <fieldset className="agent-config-fieldset">
          <legend>Plantillas de WhatsApp</legend>
          <p className="agent-config-hint">
            Fuera de la ventana de 24 h, Meta solo deja mandar plantillas que aprobó de antemano.
            Acá va el <strong>nombre con el que está registrada en Meta</strong>, no el texto.
          </p>
          {Array.from({ length: pasos }, (_, i) => (
            <div key={i} className="config-plantilla">
              <h3>Paso {i + 1}</h3>
              <label className="agent-config-field">
                Nombre en Meta
                <input
                  value={plantillasWhatsapp[i]?.nombre ?? ""}
                  onChange={(e) => editarWhatsapp(i, "nombre", e.target.value)}
                />
                <span className="agent-config-hint">Minúsculas, números y guión bajo.</span>
              </label>
              <label className="agent-config-field">
                Idioma
                <input
                  value={plantillasWhatsapp[i]?.idioma ?? "es"}
                  onChange={(e) => editarWhatsapp(i, "idioma", e.target.value)}
                />
              </label>
            </div>
          ))}
        </fieldset>

        {errorLocal && <p className="import-error">{errorLocal}</p>}
        {errorGuardar && <p className="import-error">{errorGuardar}</p>}
        {guardarMutation.isSuccess && !guardarMutation.isPending && (
          <p className="agent-config-hint">Configuración guardada.</p>
        )}

        <button type="submit" disabled={guardarMutation.isPending}>
          {guardarMutation.isPending ? "Guardando…" : "Guardar configuración"}
        </button>
      </form>
    </div>
  );
}
