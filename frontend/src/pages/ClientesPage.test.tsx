import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClientesPage } from "./ClientesPage";
import type { Cliente, ClientesStats } from "../types/cliente";

vi.mock("../auth/getAccessToken", () => ({
  getAccessToken: async () => "test-token",
}));

vi.mock("../auth/AuthContext", async () => {
  const actual = await vi.importActual("../auth/AuthContext");
  return {
    ...actual,
    useAuth: () => ({
      logout: vi.fn(),
      me: { role: "MEMBER", isPlatformAdmin: false, canHandleInbox: false },
    }),
  };
});

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClientesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const stats: ClientesStats = { total: 1, alDia: 1, atrasado: 0, sinDatos: 0 };

const clienteExistente: Cliente = {
  id: "cliente-1",
  organizationId: "org-1",
  nombre: "Ana Pérez",
  telefono: "+59899123456",
  email: "ana@example.com",
  notas: null,
  cuotaMonto: "1500",
  cuotaPeriodicidad: "MENSUAL",
  cuotaUltimoPago: "2026-09-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  cuota: { estado: "AL_DIA", diasAtraso: 0 },
};

describe("ClientesPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let clientes: Cliente[];

  beforeEach(() => {
    clientes = [clienteExistente];
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/clientes/stats")) return jsonResponse(stats);

      if (url.endsWith("/clientes") && method === "GET") return jsonResponse(clientes);

      if (url.endsWith("/clientes") && method === "POST") {
        const body = JSON.parse(init!.body as string) as Partial<Cliente>;
        const nuevo: Cliente = {
          ...clienteExistente,
          id: "cliente-2",
          nombre: body.nombre ?? "",
          telefono: (body.telefono as string | undefined) ?? null,
          email: (body.email as string | undefined) ?? null,
        };
        clientes = [...clientes, nuevo];
        return jsonResponse(nuevo, 201);
      }

      if (url.includes("/clientes/cliente-1") && method === "PATCH") {
        const body = JSON.parse(init!.body as string) as Partial<Cliente>;
        const actualizado = { ...clienteExistente, ...body };
        clientes = clientes.map((c) => (c.id === "cliente-1" ? actualizado : c));
        return jsonResponse(actualizado);
      }

      if (url.includes("/clientes/cliente-1") && method === "DELETE") {
        clientes = clientes.filter((c) => c.id !== "cliente-1");
        return { status: 204, ok: true, json: async () => null } as Response;
      }

      throw new Error(`fetch inesperado: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("lista los clientes existentes", async () => {
    renderPage();
    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
  });

  test("agregar un cliente nuevo manda el POST correcto y lo agrega a la tabla", async () => {
    renderPage();
    await screen.findByText("Ana Pérez");

    await userEvent.click(screen.getByRole("button", { name: "Nuevo cliente" }));
    await userEvent.type(screen.getByLabelText("Nombre"), "Beto Gómez");
    await userEvent.click(screen.getByRole("button", { name: "Agregar cliente" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith("/clientes") && call[1]?.method === "POST",
      );
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/clientes") && call[1]?.method === "POST",
    )!;
    const body = JSON.parse(call[1]!.body as string);
    expect(body.nombre).toBe("Beto Gómez");

    expect(await screen.findByText("Beto Gómez")).toBeInTheDocument();
  });

  test("editar un cliente precarga el formulario y manda el PATCH correcto", async () => {
    renderPage();
    await screen.findByText("Ana Pérez");

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));

    const nombreInput = screen.getByLabelText("Nombre") as HTMLInputElement;
    expect(nombreInput.value).toBe("Ana Pérez");

    await userEvent.clear(nombreInput);
    await userEvent.type(nombreInput, "Ana Gómez");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (call) => String(call[0]).includes("/clientes/cliente-1") && call[1]?.method === "PATCH",
      );
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find(
      (call) => String(call[0]).includes("/clientes/cliente-1") && call[1]?.method === "PATCH",
    )!;
    const body = JSON.parse(call[1]!.body as string);
    expect(body.nombre).toBe("Ana Gómez");

    expect(await screen.findByText("Ana Gómez")).toBeInTheDocument();
  });

  test("eliminar un cliente pide confirmación y manda el DELETE", async () => {
    renderPage();
    const fila = (await screen.findByText("Ana Pérez")).closest("tr")!;

    await userEvent.click(within(fila).getByRole("button", { name: "Eliminar" }));

    expect(window.confirm).toHaveBeenCalled();

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (call) => String(call[0]).includes("/clientes/cliente-1") && call[1]?.method === "DELETE",
      );
      expect(call).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.queryByText("Ana Pérez")).not.toBeInTheDocument();
    });
  });
});
