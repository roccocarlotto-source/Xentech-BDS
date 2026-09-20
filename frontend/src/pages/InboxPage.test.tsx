import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InboxPage } from "./InboxPage";

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
        <InboxPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const conversacion = {
  id: "conv-1",
  organizationId: "org-1",
  agentConfigId: "cfg-1",
  clienteId: "cliente-1",
  externalThreadId: "5491122223333",
  status: "TRANSFERRED_TO_HUMAN",
  lastMessageAt: "2026-09-19T12:00:00.000Z",
  createdAt: "2026-09-19T11:00:00.000Z",
  cliente: { id: "cliente-1", nombre: "Ana Pérez", telefono: "+54 9 11 2222-3333" },
  messages: [
    {
      id: "msg-2",
      organizationId: "org-1",
      conversationId: "conv-1",
      direction: "OUTBOUND",
      senderType: "AGENT",
      senderUserId: null,
      content: "Ya te derivo con una persona del equipo.",
      createdAt: "2026-09-19T12:00:00.000Z",
    },
  ],
};

const detalle = {
  conversation: {
    id: "conv-1",
    organizationId: "org-1",
    agentConfigId: "cfg-1",
    clienteId: "cliente-1",
    externalThreadId: "5491122223333",
    status: "TRANSFERRED_TO_HUMAN",
    lastMessageAt: "2026-09-19T12:00:00.000Z",
    createdAt: "2026-09-19T11:00:00.000Z",
    cliente: { id: "cliente-1", nombre: "Ana Pérez", telefono: "+54 9 11 2222-3333" },
  },
  mensajes: [
    {
      id: "msg-1",
      organizationId: "org-1",
      conversationId: "conv-1",
      direction: "INBOUND",
      senderType: "CLIENTE",
      senderUserId: null,
      content: "Necesito hablar con alguien",
      createdAt: "2026-09-19T11:59:00.000Z",
    },
    conversacion.messages[0],
  ],
};

describe("InboxPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function setupFetch() {
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/conversations/conv-1/reply") && method === "POST") {
        const body = JSON.parse(init!.body as string);
        return jsonResponse(
          {
            id: "msg-3",
            organizationId: "org-1",
            conversationId: "conv-1",
            direction: "OUTBOUND",
            senderType: "HUMAN",
            senderUserId: "u1",
            content: body.mensaje,
            createdAt: "2026-09-19T12:05:00.000Z",
          },
          201,
        );
      }
      if (url.includes("/conversations/conv-1/status") && method === "PATCH") {
        return jsonResponse({ ...detalle.conversation, status: "CLOSED" });
      }
      if (url.includes("/conversations/conv-1") && method === "GET") {
        return jsonResponse(detalle);
      }
      if (url.includes("/conversations?status=TRANSFERRED_TO_HUMAN") && method === "GET") {
        return jsonResponse([conversacion]);
      }
      throw new Error(`fetch inesperado: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("lista las conversaciones derivadas por defecto", async () => {
    setupFetch();
    renderPage();

    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Ya te derivo con una persona del equipo.")).toBeInTheDocument();
  });

  test("elegir una conversación carga el detalle y permite responder", async () => {
    setupFetch();
    renderPage();

    await userEvent.click(await screen.findByText("Ana Pérez"));

    expect(await screen.findByText("Necesito hablar con alguien")).toBeInTheDocument();

    const mensaje = screen.getByPlaceholderText("Escribí tu respuesta…");
    await userEvent.type(mensaje, "Hola, ¿en qué te puedo ayudar?");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (call) => String(call[0]).includes("/reply") && call[1]?.method === "POST",
      );
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/reply") && call[1]?.method === "POST",
    ) as [string, RequestInit];
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({ mensaje: "Hola, ¿en qué te puedo ayudar?" });
  });

  test("cerrar la conversación manda el PATCH correcto", async () => {
    setupFetch();
    renderPage();

    await userEvent.click(await screen.findByText("Ana Pérez"));
    await screen.findByText("Necesito hablar con alguien");

    await userEvent.click(screen.getByRole("button", { name: "Cerrar conversación" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (call) => String(call[0]).includes("/status") && call[1]?.method === "PATCH",
      );
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/status") && call[1]?.method === "PATCH",
    ) as [string, RequestInit];
    expect(JSON.parse(call[1].body as string)).toEqual({ status: "CLOSED" });
  });
});
