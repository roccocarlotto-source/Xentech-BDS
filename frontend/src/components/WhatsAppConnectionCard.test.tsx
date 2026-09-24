import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WhatsAppConnectionCard } from "./WhatsAppConnectionCard";
import type { WhatsAppConnection } from "../types/whatsappConnection";

vi.mock("../auth/getAccessToken", () => ({
  getAccessToken: async () => "test-token",
}));

function renderCard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WhatsAppConnectionCard />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as Response;
}

const conexionExistente: WhatsAppConnection = {
  phoneNumberId: "1234567890",
  wabaId: "999888777",
  displayPhoneNumber: "+598 99 123 456",
  status: "CONNECTED",
  updatedAt: "2026-09-24T00:00:00.000Z",
};

describe("WhatsAppConnectionCard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("sin conexión todavía", () => {
    beforeEach(() => {
      fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/whatsapp-connection") && method === "GET") return jsonResponse(null);
        if (url.endsWith("/whatsapp-connection") && method === "PUT") {
          const body = JSON.parse(init!.body as string);
          return jsonResponse({
            ...body,
            status: "CONNECTED",
            updatedAt: "2026-09-24T00:00:00.000Z",
          });
        }
        throw new Error(`fetch inesperado: ${method} ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);
    });

    test("muestra el mensaje de 'sin conectar' y el botón para conectar", async () => {
      renderCard();
      expect(
        await screen.findByText("Todavía no hay ningún número de WhatsApp conectado."),
      ).toBeInTheDocument();
    });

    test("conectar manda el PUT correcto", async () => {
      renderCard();
      await screen.findByText("Todavía no hay ningún número de WhatsApp conectado.");

      await userEvent.click(screen.getByRole("button", { name: "Conectar número" }));
      await userEvent.type(screen.getByLabelText("Phone number ID"), "1234567890");
      await userEvent.type(screen.getByLabelText("WABA ID"), "999888777");
      await userEvent.type(screen.getByLabelText("Token de acceso"), "token-secreto");
      await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          (call) => String(call[0]).endsWith("/whatsapp-connection") && call[1]?.method === "PUT",
        );
        expect(call).toBeDefined();
      });

      const call = fetchMock.mock.calls.find(
        (call) => String(call[0]).endsWith("/whatsapp-connection") && call[1]?.method === "PUT",
      )!;
      const body = JSON.parse(call[1]!.body as string);
      expect(body).toEqual({
        phoneNumberId: "1234567890",
        wabaId: "999888777",
        accessToken: "token-secreto",
      });
    });
  });

  describe("con conexión existente", () => {
    beforeEach(() => {
      fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.endsWith("/whatsapp-connection") && method === "GET") {
          return jsonResponse(conexionExistente);
        }
        if (url.endsWith("/whatsapp-connection") && method === "DELETE") {
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

    test("muestra el estado y los datos de la conexión", async () => {
      renderCard();
      expect(await screen.findByText("Conectado")).toBeInTheDocument();
      expect(screen.getByText("+598 99 123 456")).toBeInTheDocument();
      expect(screen.getByText("1234567890")).toBeInTheDocument();
    });

    test("editar precarga el formulario sin el token", async () => {
      renderCard();
      await screen.findByText("Conectado");

      await userEvent.click(screen.getByRole("button", { name: "Editar" }));

      const phoneInput = screen.getByLabelText("Phone number ID") as HTMLInputElement;
      const tokenInput = screen.getByLabelText("Token de acceso") as HTMLInputElement;
      expect(phoneInput.value).toBe("1234567890");
      expect(tokenInput.value).toBe("");
    });

    test("desconectar pide confirmación y manda el DELETE", async () => {
      renderCard();
      await screen.findByText("Conectado");

      await userEvent.click(screen.getByRole("button", { name: "Desconectar" }));

      expect(window.confirm).toHaveBeenCalled();
      await waitFor(() => {
        const call = fetchMock.mock.calls.find(
          (call) =>
            String(call[0]).endsWith("/whatsapp-connection") && call[1]?.method === "DELETE",
        );
        expect(call).toBeDefined();
      });
    });
  });
});
