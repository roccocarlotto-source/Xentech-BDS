import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// vite.config.ts usa `globals: false`, así que el auto-cleanup de
// @testing-library/react (que depende de un `afterEach` global) no se
// activa solo — hace falta registrarlo acá. Sin esto, el DOM de un test
// queda montado para el siguiente dentro del mismo archivo y aparecen
// falsos "Found multiple elements" cuando dos tests renderizan el mismo
// texto/rol.
afterEach(() => {
  cleanup();
});
