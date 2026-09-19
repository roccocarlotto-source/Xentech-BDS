import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { requirePlatformAdmin, requireOrgAdmin } from "./authorize";
import { AppError } from "../utils/AppError";
import type { AuthContext } from "../types/auth";

function reqConAuth(auth?: AuthContext): Request {
  return { auth } as Request;
}

test("requirePlatformAdmin deja pasar a un platform admin", () => {
  const auth: AuthContext = {
    userId: "u1",
    organizationId: "",
    role: "ADMIN",
    isPlatformAdmin: true,
  };
  let llamadoNext = false;

  requirePlatformAdmin(reqConAuth(auth), {} as Response, () => {
    llamadoNext = true;
  });

  assert.equal(llamadoNext, true);
});

test("requirePlatformAdmin rechaza a un usuario de tenant con 403", () => {
  const auth: AuthContext = {
    userId: "u1",
    organizationId: "org1",
    role: "ADMIN",
    isPlatformAdmin: false,
  };

  assert.throws(
    () => requirePlatformAdmin(reqConAuth(auth), {} as Response, () => undefined),
    (err: unknown) => err instanceof AppError && err.status === 403,
  );
});

test("requirePlatformAdmin rechaza si no hay auth resuelto", () => {
  assert.throws(
    () => requirePlatformAdmin(reqConAuth(undefined), {} as Response, () => undefined),
    (err: unknown) => err instanceof AppError && err.status === 403,
  );
});

test("requireOrgAdmin deja pasar a un ADMIN de su propia organización", () => {
  const auth: AuthContext = {
    userId: "u1",
    organizationId: "org1",
    role: "ADMIN",
    isPlatformAdmin: false,
  };
  let llamadoNext = false;

  requireOrgAdmin(reqConAuth(auth), {} as Response, () => {
    llamadoNext = true;
  });

  assert.equal(llamadoNext, true);
});

test("requireOrgAdmin rechaza a un MEMBER de la organización", () => {
  const auth: AuthContext = {
    userId: "u1",
    organizationId: "org1",
    role: "MEMBER",
    isPlatformAdmin: false,
  };

  assert.throws(
    () => requireOrgAdmin(reqConAuth(auth), {} as Response, () => undefined),
    (err: unknown) => err instanceof AppError && err.status === 403,
  );
});

test("requireOrgAdmin rechaza a un platform admin (no es admin de NINGUNA organización)", () => {
  const auth: AuthContext = {
    userId: "u1",
    organizationId: "",
    role: "ADMIN",
    isPlatformAdmin: true,
  };

  assert.throws(
    () => requireOrgAdmin(reqConAuth(auth), {} as Response, () => undefined),
    (err: unknown) => err instanceof AppError && err.status === 403,
  );
});

test("requireOrgAdmin rechaza si no hay auth resuelto", () => {
  assert.throws(
    () => requireOrgAdmin(reqConAuth(undefined), {} as Response, () => undefined),
    (err: unknown) => err instanceof AppError && err.status === 403,
  );
});
