import { env } from "../config/env";

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

// Registrado una sola vez por AuthContext: cualquier 401 devuelto por
// request() (venga de donde venga) termina acá, que dispara el logout.
// Mismo patrón que plataforma-crm-frontend/src/lib/api.ts.
export function registerUnauthorizedHandler(handler: UnauthorizedHandler): void {
  unauthorizedHandler = handler;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  getAccessToken: () => Promise<string | null>;
}

function buildUrl(path: string): string {
  // path llega como "/clientes" o "/me" — nunca con el prefijo "/api", que
  // se agrega acá una sola vez.
  return `${env.apiUrl}/api${path}`;
}

export async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { body, getAccessToken, headers, ...rest } = options;
  const token = await getAccessToken();

  const res = await fetch(buildUrl(path), {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError(401, "No autenticado");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const payload: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : `Error ${res.status}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}
