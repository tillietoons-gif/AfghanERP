import { describe, it, expect, vi, beforeEach } from "vitest";

// Silence toast + Lovable reporter — these tests are unit-scope only.
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock("./lovable-error-reporting", () => ({ reportLovableError: vi.fn() }));

import {
  normalizeError,
  extractFieldErrors,
  mapApiErrorToForm,
  generateIncidentId,
} from "./error-handler";

describe("generateIncidentId", () => {
  it("matches the ERR-XXXX-XXXX shape", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateIncidentId()).toMatch(/^ERR-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    }
  });
});

describe("normalizeError", () => {
  it("returns fallback for null / undefined", () => {
    expect(normalizeError(null).message).toBe("نامعلومه تېروتنه");
    expect(normalizeError(undefined).message).toBe("نامعلومه تېروتنه");
  });

  it("wraps a plain string", () => {
    const n = normalizeError("boom");
    expect(n.message).toBe("boom");
    expect(n.incidentId).toMatch(/^ERR-/);
  });

  it("maps Postgres unique_violation (23505) to Pashto", () => {
    const n = normalizeError({ code: "23505", message: "duplicate key" });
    expect(n.code).toBe("23505");
    expect(n.message).toBe("دا ریکارډ مخکې شتون لري (نقل)");
  });

  it("maps HTTP 403 status to Pashto message", () => {
    const n = normalizeError({ status: 403, message: "Forbidden" });
    expect(n.status).toBe(403);
    expect(n.message).toBe("تاسو ته اجازه نشته");
  });

  it("detects network failures from message text", () => {
    const n = normalizeError({ message: "TypeError: Failed to fetch" });
    expect(n.message).toBe("د انټرنټ اړیکه نشته یا ټکنۍ ده");
  });

  it("maps invalid login credentials", () => {
    const n = normalizeError({ message: "Invalid login credentials" });
    expect(n.message).toBe("ایمیل یا پټ نوم ناسم دی");
  });

  it("extracts fieldErrors when present on the source error", () => {
    const n = normalizeError({
      message: "validation",
      fieldErrors: { email: ["ناسم ایمیل"], name: "اړین دی" },
    });
    expect(n.fieldErrors).toEqual({ email: "ناسم ایمیل", name: "اړین دی" });
  });

  it("always attaches a unique incidentId", () => {
    const a = normalizeError({ message: "x" });
    const b = normalizeError({ message: "x" });
    expect(a.incidentId).not.toBe(b.incidentId);
  });
});

describe("extractFieldErrors", () => {
  it("handles Zod flatten shape", () => {
    const out = extractFieldErrors({ fieldErrors: { email: ["bad email"], age: ["nan"] } });
    expect(out).toEqual({ email: "bad email", age: "nan" });
  });

  it("handles Zod issues shape with nested paths", () => {
    const out = extractFieldErrors({
      issues: [
        { path: ["user", "email"], message: "required" },
        { path: ["age"], message: "must be number" },
      ],
    });
    expect(out).toEqual({ "user.email": "required", age: "must be number" });
  });

  it("handles PostgREST-like errors array with field key", () => {
    const out = extractFieldErrors({
      errors: [{ field: "barcode", message: "duplicate" }],
    });
    expect(out).toEqual({ barcode: "duplicate" });
  });

  it("returns undefined when nothing matches", () => {
    expect(extractFieldErrors({ foo: "bar" })).toBeUndefined();
    expect(extractFieldErrors(null)).toBeUndefined();
    expect(extractFieldErrors("string")).toBeUndefined();
  });

  it("first Zod issue wins for repeated keys", () => {
    const out = extractFieldErrors({
      issues: [
        { path: ["email"], message: "first" },
        { path: ["email"], message: "second" },
      ],
    });
    expect(out).toEqual({ email: "first" });
  });
});

describe("mapApiErrorToForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps Zod flatten errors into per-field messages", () => {
    const err = { fieldErrors: { email: ["ناسم"], password: ["لنډ"] } };
    const mapped = mapApiErrorToForm(err, {
      allowedFields: ["email", "password"] as const,
    });
    expect(mapped.fields).toEqual({ email: "ناسم", password: "لنډ" });
    expect(mapped.formMessage).toBeUndefined();
    expect(mapped.normalized.incidentId).toMatch(/^ERR-/);
  });

  it("renames API fields via fieldMap", () => {
    const err = { fieldErrors: { email_address: ["required"] } };
    const mapped = mapApiErrorToForm(err, {
      fieldMap: { email_address: "email" },
      allowedFields: ["email"] as const,
    });
    expect(mapped.fields).toEqual({ email: "required" });
  });

  it("routes unknown fields into formMessage when allowedFields is set", () => {
    const err = { fieldErrors: { unknown_field: ["oops"] }, message: "غلطي" };
    const mapped = mapApiErrorToForm(err, {
      allowedFields: ["email"] as const,
    });
    expect(mapped.fields).toEqual({});
    expect(mapped.formMessage).toBe("غلطي");
  });

  it("handles PostgREST 23505 shaped errors when caller enriches fieldErrors", () => {
    const enriched = {
      code: "23505",
      message: "dup",
      fieldErrors: { barcode: "دا بارکوډ مخکې ثبت شوی" },
    };
    const mapped = mapApiErrorToForm(enriched, {
      allowedFields: ["barcode"] as const,
    });
    expect(mapped.fields).toEqual({ barcode: "دا بارکوډ مخکې ثبت شوی" });
    expect(mapped.normalized.code).toBe("23505");
  });

  it("returns a formMessage when no field errors are present", () => {
    const err = { status: 500, message: "boom" };
    const mapped = mapApiErrorToForm(err, {});
    expect(mapped.fields).toEqual({});
    expect(mapped.formMessage).toBe("د سرور دننه تېروتنه");
  });
});
