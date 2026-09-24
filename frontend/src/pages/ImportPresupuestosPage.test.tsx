import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ImportPresupuestosPage } from "./ImportPresupuestosPage";

vi.mock("../auth/getAccessToken", () => ({
  getAccessToken: async () => "test-token",
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ImportPresupuestosPage />
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
  archivoNombre: "presupuesto-0458.docx",
  textoExtraido: "texto de prueba",
  datos: {
    clienteNombre: "Panadería La Espiga",
    telefono: "099 345 678",
    email: "rosana@laespiga.com.uy",
    items: "Cartel luminoso frontal 3x1m",
    monto: 45000,
    moneda: "UYU",
    fechaEmision: "2026-08-12",
    validez: "15 días",
    vendedor: "Martín Sosa",
  },
};

const clientesVacio: unknown[] = [];

const clienteExistente = {
  id: "cli-1",
  organizationId: "org-1",
  nombre: "Panadería La Espiga",
  telefono: "099345678",
  email: null,
  notas: null,
  cuotaMonto: null,
  cuotaPeriodicidad: null,
  cuotaUltimoPago: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
  cuota: { estado: "SIN_DATOS", diasAtraso: 0 },
};

const presupuestoCreado = {
  id: "presu-1",
  clienteId: "cli-1",
  estado: "PENDIENTE",
  descripcion: "Cartel luminoso frontal 3x1m",
  monto: "45000",
  moneda: "UYU",
};

async function subirArchivo() {
  const file = new File(["contenido"], "presupuesto-0458.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  await userEvent.upload(screen.getByLabelText("Archivo del presupuesto"), file);
  await userEvent.click(screen.getByRole("button", { name: "Analizar presupuesto" }));
}

describe("ImportPresupuestosPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let clientes: unknown[];

  beforeEach(() => {
    clientes = clientesVacio;
    fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/presupuestos/import/preview")) return jsonResponse(previewResponse);
      if (url.includes("/presupuestos/import/commit")) return jsonResponse(presupuestoCreado, 201);
      if (url.endsWith("/clientes")) return jsonResponse(clientes);
      throw new Error(`fetch inesperado: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("analiza el archivo y precarga cliente nuevo con los datos extraídos cuando no hay match por teléfono", async () => {
    renderPage();
    await subirArchivo();

    expect(await screen.findByLabelText("Nombre *")).toHaveValue("Panadería La Espiga");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("099 345 678");
    expect(screen.getByLabelText("Detalle (lo presupuestado)")).toHaveValue(
      "Cartel luminoso frontal 3x1m",
    );
    expect(screen.getByLabelText("Monto")).toHaveValue(45000);
    expect(screen.getByText(/Vendedor \(según el texto\): Martín Sosa/)).toBeInTheDocument();
  });

  test("sugiere un cliente existente cuando el teléfono matchea", async () => {
    clientes = [clienteExistente];
    renderPage();
    await subirArchivo();

    const radioExistente = await screen.findByRole("radio", { name: "Cliente existente" });
    await waitFor(() => expect(radioExistente).toBeChecked());
    expect(screen.getByRole("combobox", { name: "Elegir cliente" })).toHaveValue("cli-1");
  });

  test("el botón de guardar exige elegir sí/no de seguimiento por WhatsApp", async () => {
    renderPage();
    await subirArchivo();
    await screen.findByLabelText("Nombre *");

    const guardar = screen.getByRole("button", { name: "Guardar presupuesto" });
    expect(guardar).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: "No, solo por email" }));
    expect(guardar).toBeEnabled();
  });

  test("si elige seguimiento por WhatsApp, exige el origen del consentimiento", async () => {
    renderPage();
    await subirArchivo();
    await screen.findByLabelText("Nombre *");

    const guardar = screen.getByRole("button", { name: "Guardar presupuesto" });
    await userEvent.click(
      screen.getByRole("radio", { name: "Sí, hay consentimiento de WhatsApp" }),
    );
    expect(guardar).toBeDisabled();

    await userEvent.click(
      screen.getByRole("radio", { name: "El cliente pidió el presupuesto por WhatsApp" }),
    );
    expect(guardar).toBeEnabled();
  });

  test("confirma la importación y manda el payload esperado a /commit", async () => {
    renderPage();
    await subirArchivo();
    await screen.findByLabelText("Nombre *");

    await userEvent.click(screen.getByRole("radio", { name: "No, solo por email" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar presupuesto" }));

    await screen.findByText("Presupuesto guardado correctamente.");

    const commitCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/presupuestos/import/commit"),
    );
    expect(commitCall).toBeDefined();
    const [, requestInit] = commitCall as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string);
    expect(body).toMatchObject({
      archivoNombre: "presupuesto-0458.docx",
      cliente: { modo: "nuevo", nombre: "Panadería La Espiga" },
      seguimientoWhatsapp: false,
      consentimientoWhatsappOrigen: null,
      monto: 45000,
      moneda: "UYU",
    });
  });
});
