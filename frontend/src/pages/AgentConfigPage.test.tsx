import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AgentConfigPage } from "./AgentConfigPage";

vi.mock("../auth/getAccessToken", () => ({
  getAccessToken: async () => "test-token",
}));

vi.mock("../auth/AuthContext", async () => {
  const actual = await vi.importActual("../auth/AuthContext");
  return { ...actual, useAuth: () => ({ logout: vi.fn() }) };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AgentConfigPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const configExistente = {
  id: "cfg-1",
  organizationId: "org-1",
  agentType: "WHATSAPP",
  instructions: "Respondé siempre en español.",
  guardrails: {
    temasProhibidos: [],
    accionesProhibidas: [],
    condicionesDeDerivacion: [],
    promesasProhibidas: [],
    datosRequeridosAntesDeAccion: [],
  },
  enabledTools: ["consultar_mi_cuota"],
  modelProvider: "openrouter",
  modelName: "openai/gpt-4o-mini",
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("AgentConfigPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function setupFetch(agentConfig: unknown, knowledgeBase: unknown[] = []) {
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      // WhatsAppConnectionCard vive dentro de AgentConfigPage y dispara su
      // propio fetch al montarse -- acá no es el foco de los tests de esta
      // página (eso vive en WhatsAppConnectionCard.test.tsx), alcanza con
      // "sin conexión todavía" para no romper el resto de los mocks.
      if (url.endsWith("/whatsapp-connection") && method === "GET") {
        return jsonResponse(null);
      }

      if (url.endsWith("/agent-config/WHATSAPP") && method === "GET") {
        return jsonResponse(agentConfig);
      }
      if (url.endsWith("/agent-config/WHATSAPP") && method === "PUT") {
        const body = JSON.parse(init!.body as string);
        return jsonResponse({ ...configExistente, ...body, id: "cfg-1" });
      }
      if (url.endsWith("/agent-config/WHATSAPP/test-message") && method === "POST") {
        return jsonResponse({
          respuesta: "Tu cuota está al día.",
          conversationId: "conv-1",
          clienteId: "cliente-1",
          derivadoAHumano: false,
        });
      }
      if (url.endsWith("/knowledge-base-entries") && method === "GET") {
        return jsonResponse(knowledgeBase);
      }
      if (url.endsWith("/knowledge-base-entries") && method === "POST") {
        const body = JSON.parse(init!.body as string);
        return jsonResponse(
          { id: "kb-nueva", organizationId: "org-1", isActive: true, ...body },
          201,
        );
      }
      throw new Error(`fetch inesperado: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("carga la configuración existente en el formulario", async () => {
    setupFetch(configExistente);
    renderPage();

    expect(await screen.findByDisplayValue("Respondé siempre en español.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("openai/gpt-4o-mini")).toBeInTheDocument();

    // El mismo nombre de tool aparece dos veces: en "Acciones habilitadas" y
    // en "Acciones prohibidas" de guardrails (son checkboxes distintos, uno
    // por fieldset). El primero en el DOM es el de "habilitadas".
    const [habilitada] = screen.getAllByRole("checkbox", {
      name: "Consultar el estado de la cuota",
    });
    expect(habilitada).toBeChecked();
  });

  test("guardar manda el PUT con el body armado desde el formulario", async () => {
    setupFetch(configExistente);
    renderPage();

    const modelName = await screen.findByDisplayValue("openai/gpt-4o-mini");
    await userEvent.clear(modelName);
    await userEvent.type(modelName, "openai/gpt-4o");

    await userEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith("/agent-config/WHATSAPP") && call[1]?.method === "PUT",
      );
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/agent-config/WHATSAPP") && call[1]?.method === "PUT",
    ) as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body.modelName).toBe("openai/gpt-4o");
    expect(body.enabledTools).toEqual(["consultar_mi_cuota"]);

    expect(await screen.findByText("Configuración guardada.")).toBeInTheDocument();
  });

  test("cuando no hay configuración todavía, el formulario arranca vacío", async () => {
    setupFetch(null);
    renderPage();

    expect(await screen.findByText("Guardar configuración")).toBeInTheDocument();
    const instructions = screen.getByPlaceholderText(
      "Sos el asistente de WhatsApp de [tu empresa]. Respondé de forma breve y amable…",
    ) as HTMLTextAreaElement;
    expect(instructions.value).toBe("");
  });

  test("probar el agente manda el mensaje y muestra la respuesta", async () => {
    setupFetch(configExistente);
    renderPage();

    const mensaje = await screen.findByLabelText("Mensaje");
    await userEvent.type(mensaje, "¿Cómo está mi cuota?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText("Tu cuota está al día.")).toBeInTheDocument();
    expect(screen.getByText("¿Cómo está mi cuota?")).toBeInTheDocument();
  });

  test("agregar una entrada a la base de conocimiento manda el POST correcto", async () => {
    setupFetch(configExistente, []);
    renderPage();

    await screen.findByText("Todavía no hay entradas.");

    await userEvent.type(screen.getByLabelText("Título"), "Horario de atención");
    await userEvent.type(screen.getByLabelText("Contenido"), "Lunes a viernes de 9 a 18.");
    await userEvent.click(screen.getByRole("button", { name: "Agregar entrada" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith("/knowledge-base-entries") && call[1]?.method === "POST",
      );
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/knowledge-base-entries") && call[1]?.method === "POST",
    ) as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({
      titulo: "Horario de atención",
      contenido: "Lunes a viernes de 9 a 18.",
    });
  });
});
