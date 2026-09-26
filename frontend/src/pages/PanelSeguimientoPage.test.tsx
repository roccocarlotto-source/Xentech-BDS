import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PanelSeguimientoPage } from "./PanelSeguimientoPage";

vi.mock("../auth/getAccessToken", () => ({
  getAccessToken: async () => "test-token",
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PanelSeguimientoPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const clienteBase = {
  id: "cli-1",
  nombre: "Panadería La Espiga",
  personaContacto: "Rosana Fernández",
  email: "rosana@laespiga.test",
  telefono: null,
};

const pideDescuento = {
  id: "presu-1",
  estado: "EN_SEGUIMIENTO" as const,
  descripcion: "Cartel luminoso frontal",
  monto: "45000",
  moneda: "UYU",
  fechaEmision: "2026-08-12",
  createdAt: "2026-08-12T10:00:00.000Z",
  cliente: clienteBase,
  ultimaRespuesta: {
    fecha: "2026-09-20T10:00:00.000Z",
    contenido: "¿Me hacen un mejor precio?",
    clasificacionIa: "PIDE_DESCUENTO" as const,
    resumenIa: "Pregunta si pueden mejorar el precio.",
    requiereVendedor: true,
  },
  resenaSolicitada: false,
};

const aceptado = {
  ...pideDescuento,
  id: "presu-2",
  estado: "ACEPTADO" as const,
  descripcion: "Señalética interior",
  ultimaRespuesta: {
    fecha: "2026-09-21T10:00:00.000Z",
    contenido: "Dale, arranquen.",
    clasificacionIa: "ACEPTA" as const,
    resumenIa: "Acepta y quiere avanzar.",
    requiereVendedor: true,
  },
  resenaSolicitada: false,
};

const sinRespuesta = {
  ...pideDescuento,
  id: "presu-3",
  descripcion: "Banner de vidriera",
  estado: "PENDIENTE" as const,
  ultimaRespuesta: null,
  resenaSolicitada: false,
};

describe("PanelSeguimientoPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("muestra la clasificación y marca las que necesitan una persona", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([pideDescuento, sinRespuesta])),
    );
    renderPage();

    expect(await screen.findByText("Pide descuento")).toBeInTheDocument();
    expect(screen.getByText(/te toca/)).toBeInTheDocument();
    expect(screen.getByText("Sin respuestas")).toBeInTheDocument();
  });

  test("el filtro deja solo las que necesitan respuesta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([pideDescuento, sinRespuesta])),
    );
    renderPage();

    await screen.findByText("Pide descuento");
    expect(screen.getByText("Banner de vidriera")).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText(/Solo los que necesitan/));

    // El que no tiene respuesta desaparece; queda el que pide descuento.
    expect(screen.queryByText("Banner de vidriera")).not.toBeInTheDocument();
    expect(screen.getByText("Cartel luminoso frontal")).toBeInTheDocument();
  });

  test("el botón de reseña solo aparece en los aceptados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([pideDescuento, aceptado])),
    );
    renderPage();

    await screen.findByText("Señalética interior");
    // Uno solo: el aceptado. El que pide descuento no lo tiene.
    expect(screen.getAllByRole("button", { name: "Solicitar reseña" })).toHaveLength(1);
  });

  test("no se vuelve a ofrecer si la reseña ya se pidió", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse([{ ...aceptado, resenaSolicitada: true }])),
    );
    renderPage();

    expect(await screen.findByText("Reseña pedida")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Solicitar reseña" })).not.toBeInTheDocument();
  });

  test("al solicitar, avisa que el email salió", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("solicitar-resena")
          ? jsonResponse(
              { token: "tok-1", venceEn: "2026-10-26", emailEnviado: true, motivo: null },
              201,
            )
          : jsonResponse([aceptado]),
      ),
    );
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Solicitar reseña" }));
    await waitFor(() => expect(screen.getByText(/Link enviado por email/)).toBeInTheDocument());
  });

  test("si el email no sale, muestra el link para copiarlo a mano", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("solicitar-resena")
          ? jsonResponse(
              {
                token: "tok-1",
                venceEn: "2026-10-26",
                emailEnviado: false,
                motivo: "El cliente no tiene email cargado.",
              },
              201,
            )
          : jsonResponse([aceptado]),
      ),
    );
    renderPage();

    await userEvent.click(await screen.findByRole("button", { name: "Solicitar reseña" }));
    await waitFor(() => expect(screen.getByText(/no tiene email/)).toBeInTheDocument());
    expect(screen.getByText(/\/r\/tok-1/)).toBeInTheDocument();
  });

  test("con el módulo apagado (404) lo dice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "no habilitado" }, 404)),
    );
    renderPage();

    expect(await screen.findByText(/no está habilitado/)).toBeInTheDocument();
  });
});
