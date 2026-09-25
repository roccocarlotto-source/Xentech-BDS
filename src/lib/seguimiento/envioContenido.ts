// Etapa 5, paso 2 (§6.3 + §5 del diseño): arma el asunto/cuerpo del email de
// un paso de seguimiento. Puro a propósito (sin Prisma, sin fecha real),
// mismo criterio que envioScheduling.ts, para poder testear el contenido
// sin DB.

export interface PlantillaEmail {
  asunto: string;
  cuerpo: string;
}

export interface DatosPresupuestoParaEmail {
  clienteNombre: string;
  monto: number | null;
  moneda: string | null;
}

export interface EmailSeguimiento {
  asunto: string;
  cuerpo: string;
}

// §5: "la línea de baja NO va en la plantilla: la agrega el motor de envío a
// TODO email, para que ninguna plantilla pueda omitirla" (comentario de
// plantillaEmailSchema en configSeguimiento.schema.ts). Se agrega siempre,
// tenga o no plantilla configurada.
export const LINEA_BAJA =
  "\n\n---\nSi preferís no recibir más mensajes de seguimiento sobre este presupuesto, respondé este correo con la palabra BAJA.";

function montoFormateado(monto: number | null, moneda: string | null): string | null {
  if (monto === null) return null;
  return moneda ? `${moneda} ${monto}` : String(monto);
}

// Sin plantilla configurada para este paso (§6.6: "Configuración de...
// plantillas" es la etapa 8 -- una organización puede no tener ninguna
// todavía), se usa este texto genérico. No hace reemplazo de variables en
// las plantillas de email (a diferencia de WhatsApp, §6.4): la plantilla de
// email es "texto libre por paso" según el schema, sin variables definidas
// en el diseño -- decisión propia, a confirmar por Rocco si se quiere algo
// tipo {{nombre}} acá también.
export function armarEmailSeguimiento(
  datos: DatosPresupuestoParaEmail,
  plantilla?: PlantillaEmail,
): EmailSeguimiento {
  if (plantilla) {
    return {
      asunto: plantilla.asunto,
      cuerpo: `${plantilla.cuerpo}${LINEA_BAJA}`,
    };
  }

  const monto = montoFormateado(datos.monto, datos.moneda);
  const cuerpo = [
    `Hola ${datos.clienteNombre},`,
    "",
    monto
      ? `Te escribimos para saber si tuviste chance de revisar el presupuesto (${monto}) que te enviamos.`
      : "Te escribimos para saber si tuviste chance de revisar el presupuesto que te enviamos.",
    "",
    "Cualquier duda o comentario, respondé este mismo correo.",
  ].join("\n");

  return {
    asunto: "Seguimiento de tu presupuesto",
    cuerpo: `${cuerpo}${LINEA_BAJA}`,
  };
}
