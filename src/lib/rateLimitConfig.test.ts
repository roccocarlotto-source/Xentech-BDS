import assert from "node:assert/strict";
import { test } from "node:test";
import { getRateLimitOptions } from "./rateLimitConfig";

test("sin env vars -> defaults (15min / 600 requests)", () => {
  assert.deepEqual(getRateLimitOptions({}), { windowMs: 15 * 60 * 1000, limit: 600 });
});

test("env vars validas -> las usa", () => {
  assert.deepEqual(getRateLimitOptions({ RATE_LIMIT_WINDOW_MS: "60000", RATE_LIMIT_MAX: "10" }), {
    windowMs: 60000,
    limit: 10,
  });
});

test("env vars invalidas (no numericas, negativas, cero) -> caen al default", () => {
  assert.deepEqual(getRateLimitOptions({ RATE_LIMIT_MAX: "abc" }), {
    windowMs: 15 * 60 * 1000,
    limit: 600,
  });
  assert.deepEqual(getRateLimitOptions({ RATE_LIMIT_MAX: "-5" }), {
    windowMs: 15 * 60 * 1000,
    limit: 600,
  });
  assert.deepEqual(getRateLimitOptions({ RATE_LIMIT_MAX: "0" }), {
    windowMs: 15 * 60 * 1000,
    limit: 600,
  });
});

test("valor decimal se trunca", () => {
  assert.deepEqual(getRateLimitOptions({ RATE_LIMIT_MAX: "10.7" }).limit, 10);
});
