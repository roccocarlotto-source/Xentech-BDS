import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResenasPage } from "./ResenasPage";

vi.mock("../auth/getAccessToken", () => ({
  getAccessToken: async () => "test-token",
}));

let rol: "ADMIN" | "MEMBER" = "ADMIN";

vi.mock("../auth/AuthContext", async () => {
  const actual = await vi.importActual("../auth/AuthContext");
  return {
    ...actual,
    useAuth: () => ({
      logout: vi.fn(),
      me: {
        userId: "u1",
        organizationId: "org-1",
        role: rol,
        isPlatformAdmin: false,
        canHandleInbox: false,
        agentesHabilitados: ["SEGUIMIENTO_RESENAS"],
      },
    }),
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResenasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const resenas = [
  {
    id: "r1",
    anonimo: false,
    nombreVisible: "Ana Pérez",
    estrellas: 2,
    comentario: "Tardaron",
    moderacion: "APROBADA",
    moderadoEn: null,
    motivoModeracion: null,
    createdAt: "2026-09-20T12:00:00Z",
    cliente: { id: "c1", nombre: "Ana Pérez" },
    moderadoPor: null,
  },
];

function setupFetch() {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/clientes")) {
      return jsonResponse([{ id: "c1", nombre: "Ana Pérez" }]);
    }
    if (url.endsWith("/resenas/links") && method === "POST") {
      return jsonResponse({ token: "TOKEN123", venceEn: "2026-10-24T12:00:00Z" }, 201);
    }
    if (url.includes("/resenas/r1/moderacion") && method === "PATCH") {
      return { status: 204, ok: true, json: async () => null } as Response;
    }
    if (url.includes("/resenas")) {
      return jsonResponse(resenas);
    }
    throw new Error(`fetch inesperado: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("ResenasPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    rol = "ADMIN";
  });

  test("genera un link de reseña para un cliente y lo muestra con /r/<token>", async () => {
    const fetchMock = setupFetch();
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("option", { name: "Ana Pérez" });
    await user.selectOptions(screen.getByLabelText("Cliente"), "c1");
    await user.click(screen.getByRole("button", { name: "Generar link" }));

    const input = await screen.findByLabelText("Link de reseña");
    expect(input).toHaveValue(`${window.location.origin}/r/TOKEN123`);
    const llamada = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/resenas/links"))!;
    expect(JSON.parse(llamada[1]!.body as string)).toEqual({ clienteId: "c1" });
  });

  test("el admin rechaza una reseña: exige motivo y lo manda", async () => {
    const fetchMock = setupFetch();
    const user = userEvent.setup();
    renderPage();

    const fila = (await screen.findByText("Tardaron")).closest("tr")!;
    await user.click(within(fila).getByRole("button", { name: "Rechazar" }));
    const confirmar = within(fila).getByRole("button", { name: "Confirmar" });
    expect(confirmar).toBeDisabled();
    await user.type(within(fila).getByLabelText("Motivo del rechazo"), "spam");
    await user.click(confirmar);

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([, i]) => i?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(patch![1]!.body as string)).toEqual({
        moderacion: "RECHAZADA",
        motivo: "spam",
      });
    });
  });

  test("un miembro ve las reseñas pero no puede moderar", async () => {
    rol = "MEMBER";
    setupFetch();
    renderPage();

    expect(await screen.findByText("Tardaron")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 de 5 estrellas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument();
  });
});
