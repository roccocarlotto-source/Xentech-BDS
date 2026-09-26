import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigSeguimientoPage } from "./ConfigSeguimientoPage";

vi.mock("../auth/getAccessToken", () => ({
  getAccessToken: async () => "test-token",
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConfigSeguimientoPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const configPorDefecto = {
  intervalosDias: [2, 7, 15],
  maxIntentos: 3,
  horaInicioEnvio: 9,
  horaFinEnvio: 20,
  zonaHoraria: "America/Montevideo",
  plantillas: { EMAIL: [], WHATSAPP: [] },
  diasValidezTokenResena: 30,
  personalizada: false,
  actualizadaEn: null,
};

describe("ConfigSeguimientoPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("sin config propia, avisa que igual está funcionando con esos valores", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(configPorDefecto)),
    );
    renderPage();

    expect(await screen.findByText(/ya está funcionando/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Días de seguimiento/)).toHaveValue("2, 7, 15");
  });

  test("hay un bloque de plantilla por cada paso de la secuencia", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(configPorDefecto)),
    );
    renderPage();

    await screen.findByLabelText(/Días de seguimiento/);
    // 3 intervalos -> 3 pasos de email + 3 de WhatsApp.
    expect(screen.getAllByRole("heading", { name: /^Paso \d$/ })).toHaveLength(6);

    // Al sacar un intervalo, desaparece un paso de cada lado.
    await userEvent.clear(screen.getByLabelText(/Días de seguimiento/));
    await userEvent.type(screen.getByLabelText(/Días de seguimiento/), "3, 9");
    expect(screen.getAllByRole("heading", { name: /^Paso \d$/ })).toHaveLength(4);
  });

  test("rechaza intervalos que no van de menor a mayor, sin llamar al backend", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(configPorDefecto),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const campo = await screen.findByLabelText(/Días de seguimiento/);
    await userEvent.clear(campo);
    await userEvent.type(campo, "10, 3");
    await userEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    // /de menor a mayor/ también matchea el texto de ayuda del campo:
    // se busca la parte que solo está en el error.
    expect(await screen.findByText(/sin repetir/)).toBeInTheDocument();
    // Solo el GET inicial: no se mandó el PUT.
    expect(
      fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === "PUT"),
    ).toHaveLength(0);
  });

  test("guarda y manda al backend lo que se editó", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      init?.method === "PUT"
        ? jsonResponse({ ...configPorDefecto, intervalosDias: [1, 4], personalizada: true })
        : jsonResponse(configPorDefecto),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    const campo = await screen.findByLabelText(/Días de seguimiento/);
    await userEvent.clear(campo);
    await userEvent.type(campo, "1, 4");
    await userEvent.click(screen.getByRole("button", { name: "Guardar configuración" }));

    await waitFor(() => expect(screen.getByText("Configuración guardada.")).toBeInTheDocument());

    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === "PUT");
    expect(put).toBeDefined();
    const body = JSON.parse((put![1] as RequestInit).body as string);
    expect(body.intervalosDias).toEqual([1, 4]);
    // Las plantillas se recortan a la cantidad de pasos.
    expect(body.plantillas.EMAIL.length).toBeLessThanOrEqual(2);
  });

  test("con el módulo apagado (404) lo dice, en vez de un error genérico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "no habilitado" }, 404)),
    );
    renderPage();

    expect(await screen.findByText(/no está habilitado/)).toBeInTheDocument();
  });
});
