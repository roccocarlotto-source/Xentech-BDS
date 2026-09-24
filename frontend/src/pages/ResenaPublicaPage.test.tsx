import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResenaPublicaPage } from "./ResenaPublicaPage";

const TOKEN = "a".repeat(43);

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/r/${TOKEN}`]}>
        <Routes>
          <Route path="/r/:token" element={<ResenaPublicaPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

describe("ResenaPublicaPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("publica una reseña: estrellas + cómo figurar obligatorios, token en el body, sin Authorization", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      expect(url).not.toContain(TOKEN);
      if (url.endsWith("/public/resenas/formulario")) {
        expect(JSON.parse(init!.body as string)).toEqual({ token: TOKEN });
        return jsonResponse({ organizacion: "Cartelería Sur", nombreCliente: "Ana Pérez" });
      }
      if (url.endsWith("/public/resenas") && init?.method === "POST") {
        return jsonResponse({ ok: true }, 201);
      }
      throw new Error(`fetch inesperado: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /experiencia con Cartelería Sur/ }),
    ).toBeInTheDocument();
    const enviar = screen.getByRole("button", { name: "Enviar reseña" });
    expect(enviar).toBeDisabled();

    await user.click(screen.getByLabelText("4 estrellas"));
    expect(enviar).toBeDisabled();
    await user.click(screen.getByLabelText("Publicar como Ana Pérez"));
    await user.type(screen.getByLabelText(/Comentario/), "  Muy buen trabajo ");
    expect(enviar).toBeEnabled();
    await user.click(enviar);

    expect(await screen.findByText("¡Gracias por tu reseña!")).toBeInTheDocument();
    const publicar = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/public/resenas"))!;
    expect(JSON.parse(publicar[1]!.body as string)).toEqual({
      token: TOKEN,
      anonimo: false,
      estrellas: 4,
      comentario: "Muy buen trabajo",
    });
  });

  test("como anónimo manda anonimo: true", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/formulario")) {
        return jsonResponse({ organizacion: "X", nombreCliente: "Ana" });
      }
      return jsonResponse({ ok: true }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText("1 estrella"));
    await user.click(screen.getByLabelText("Publicar como anónimo"));
    await user.click(screen.getByRole("button", { name: "Enviar reseña" }));

    await screen.findByText("¡Gracias por tu reseña!");
    const body = JSON.parse(fetchMock.mock.calls[1][1]!.body as string);
    expect(body).toMatchObject({ anonimo: true, estrellas: 1, comentario: null });
  });

  test("link inválido: muestra el mensaje amable del backend y ningún formulario", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "Este link de reseña ya no está disponible." }, 404)),
    );
    renderPage();

    expect(await screen.findByText("Link no disponible")).toBeInTheDocument();
    expect(screen.getByText("Este link de reseña ya no está disponible.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar reseña" })).not.toBeInTheDocument();
  });

  test("si el token se usó en el medio, muestra el error del backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) =>
        String(input).endsWith("/formulario")
          ? jsonResponse({ organizacion: "X", nombreCliente: "Ana" })
          : jsonResponse({ error: "Ya se usó" }, 404),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByLabelText("5 estrellas"));
    await user.click(screen.getByLabelText("Publicar como anónimo"));
    await user.click(screen.getByRole("button", { name: "Enviar reseña" }));
    await waitFor(() => expect(screen.getByText("Ya se usó")).toBeInTheDocument());
  });
});
