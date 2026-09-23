import "dotenv/config";
import { createApp } from "./app";
import { startAgentInboundJobPoller } from "./lib/whatsapp/inboundJobPoller";

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
