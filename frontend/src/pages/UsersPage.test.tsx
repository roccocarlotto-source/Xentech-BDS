import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UsersPage } from "./UsersPage";

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
        <UsersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const usuarios = [
  {
    id: "u1",
    organizationId: "org-1",
    email: "admin@acme.com",
    role: "ADMIN",
    canHandleInbox: false,
  },
  {
    id: "u2",
    organizationId: "org-1",
    email: "juan@acme.com",
    role: "MEMBER",
    canHandleInbox: false,
  },
];

describe("UsersPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  function setupFetch() {
    fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/users/u2/permissions") && method === "PATCH") {
        const body = JSON.parse(init!.body as string);
        return jsonResponse({ ...usuarios[1], ...body });
      }
      if (url.endsWith("/users") && method === "GET") {
        return jsonResponse(usuarios);
      }
      throw new Error(`fetch inesperado: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("lista los usuarios de la organización con el admin siempre tildado", async () => {
    setupFetch();
    renderPage();

    expect(await screen.findByText("admin@acme.com")).toBeInTheDocument();
    expect(screen.getByText("juan@acme.com")).toBeInTheDocument();

    const adminCheckbox = screen.getByRole("checkbox", {
      name: "Permiso de inbox para admin@acme.com",
    });
    expect(adminCheckbox).toBeChecked();
    expect(adminCheckbox).toBeDisabled();

    const memberCheckbox = screen.getByRole("checkbox", {
      name: "Permiso de inbox para juan@acme.com",
    });
    expect(memberCheckbox).not.toBeChecked();
    expect(memberCheckbox).not.toBeDisabled();
  });

  test("tildar el permiso de un MEMBER manda el PATCH correcto", async () => {
    setupFetch();
    renderPage();

    const memberCheckbox = await screen.findByRole("checkbox", {
      name: "Permiso de inbox para juan@acme.com",
    });
    await userEvent.click(memberCheckbox);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((call) => String(call[0]).includes("/permissions"));
      expect(call).toBeDefined();
    });

    const call = fetchMock.mock.calls.find((call) => String(call[0]).includes("/permissions")) as [
      string,
      RequestInit,
    ];
    expect(call[0]).toContain("/users/u2/permissions");
    expect(call[1].method).toBe("PATCH");
    expect(JSON.parse(call[1].body as string)).toEqual({ canHandleInbox: true });
  });
});
