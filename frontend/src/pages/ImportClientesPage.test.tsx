import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportClientesPage } from "./ImportClientesPage";

vi.mock("../auth/getAccessToken", () => ({
  getAccessToken: async () => "test-token",
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ImportClientesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

const previewResponse = {
  headers: ["Nombre", "Telefono"],
  totalRows: 2,
  sampleRows: [
    { Nombre: "Ana Pérez", Telefono: "099111222" },
    { Nombre: "Beto Gómez", Telefono: "099333444" },
  ],
  suggestedMapping: { nombre: "Nombre", telefono: "Telefono" },
};

const commitResponse = {
  totalRows: 2,
  creados: 1,
  errores: [{ fila: 3, mensaje: "El nombre es requerido" }],
};

async function subirArchivo() {
  const file = new File(["contenido"], "clientes.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await userEvent.upload(screen.getByLabelText("Archivo Excel"), file);
  await userEvent.click(screen.getByRole("button", { name: "Analizar archivo" }));
}

describe("ImportClientesPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/clientes/import/preview")) return jsonResponse(previewResponse);
      if (url.includes("/clientes/import/commit")) return jsonResponse(commitResponse);
      throw new Error(`fetch inesperado: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("analiza el archivo y muestra el mapeo sugerido", async () => {
    renderPage();
    await subirArchivo();

    await screen.findByRole("button", { name: "Importar 2 clientes" });

    const nombreSelect = screen.getByRole("combobox", { name: /^Nombre/ });
    expect(nombreSelect).toHaveValue("Nombre");

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.body).toBeInstanceOf(FormData);
  });

  test("confirma la importacion y muestra el resultado con errores", async () => {
    renderPage();
    await subirArchivo();
    await userEvent.click(await screen.findByRole("button", { name: "Importar 2 clientes" }));

    await waitFor(() =>
      expect(document.querySelector(".import-card")?.textContent).toMatch(/1.*de 2 filas/),
    );
    expect(screen.getByText(/Fila 3: El nombre es requerido/)).toBeInTheDocument();

    const commitCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/clientes/import/commit"),
    );
    expect(commitCall).toBeDefined();
    const [, requestInit] = commitCall as [string, RequestInit];
    const body = requestInit.body as FormData;
    expect(body.get("mapping")).toBe(JSON.stringify(previewResponse.suggestedMapping));
  });

  test("el boton de importar esta deshabilitado si no hay columna de nombre mapeada", async () => {
    fetchMock = vi.fn(async () => jsonResponse({ ...previewResponse, suggestedMapping: {} }));
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await subirArchivo();

    expect(await screen.findByRole("button", { name: "Importar 2 clientes" })).toBeDisabled();
  });
});
