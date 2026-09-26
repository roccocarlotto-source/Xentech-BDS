import "dotenv/config";
import { createApp } from "./app";
import { startAgentInboundJobPoller } from "./lib/whatsapp/inboundJobPoller";
import { startEnvioJobPoller } from "./lib/seguimiento/envioJobPoller";
import { startClasificacionPoller } from "./lib/seguimiento/clasificacionPoller";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

app.listen(port, () => {
  console.log(`xentech-backend escuchando en :${port}`);
});

// Cola de procesamiento del webhook de WhatsApp (ver AgentInboundJob en
// schema.prisma) -- corre siempre que el server esté arriba, aunque no
// haya ninguna conexión de WhatsApp real todavía (sin jobs en la tabla,
// cada tick no hace nada).
startAgentInboundJobPoller({
  onError: (err) => console.error("Error en el poller de jobs entrantes:", err),
});

// Motor de seguimiento por email (etapa 5, paso 2 de
// docs/seguimiento-resenas-diseno.md) -- corre siempre, pero sin proveedor
// de email elegido todavía (§3 del diseño, ver src/lib/email/emailProvider.ts)
// cada tick no hace nada.
startEnvioJobPoller({
  onError: (err) => console.error("Error en el job de envíos de seguimiento:", err),
});

// Clasificación con IA de las respuestas entrantes (etapa 7, §6.5). Igual
// que los otros: sin respuestas sin clasificar en la tabla, cada tick no
// hace nada. Necesita OPENROUTER_API_KEY para funcionar de verdad.
startClasificacionPoller({
  onError: (err) => console.error("Error en el poller de clasificación de respuestas:", err),
});
