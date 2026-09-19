import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminOrganizationsPage } from "./AdminOrganizationsPage";

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
        <AdminOrganizationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const organizaciones = [
  {
    organizationId: "org-1",
    organizationName: "Acme SA",
    toggles: { WHATSAPP: true, DATABASE_MANAGEMENT: false, REMINDERS: false },
  },
];

describe("AdminOrganizationsPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/admin/organizations/") && url.includes("/agent-toggles/")) {
        return { status: 204, ok: true, json: async () => null } as Response;
      }
      if (url.endsWith("/admin/organizations")) return jsonResponse(organizaciones);
      throw new Error(`fetch inesperado: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("lista organizaciones con el estado de cada toggle", async () => {
    renderPage();

    expect(await screen.findByText("Acme SA")).toBeInTheDocument();

    const whatsapp = screen.getByRole("checkbox", { name: "WhatsApp para Acme SA" });
    const dbManagement = screen.getByRole("checkbox", {
      name: "Gestión de base de datos para Acme SA",
    });
    expect(whatsapp).toBeChecked();
    expect(dbManagement).not.toBeChecked();
  });

  test("tildar un toggle manda el PUT correcto", async () => {
    renderPage();
    const dbManagement = await screen.findByRole("checkbox", {
      name: "Gestión de base de datos para Acme SA",
    });

    await userEvent.click(dbManagement);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((call) => String(call[0]).includes("/agent-toggles/"));
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/agent-toggles/"),
    ) as [string, RequestInit];
    const [url, init] = call;
    expect(url).toContain("/admin/organizations/org-1/agent-toggles/DATABASE_MANAGEMENT");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ enabled: true });
  });
});
