import { describe, expect, it } from "vitest";
import { validarUrlSupabase } from "./env";

describe("validarUrlSupabase", () => {
  it("aceita a URL base, com ou sem barra final", () => {
    expect(validarUrlSupabase("https://abc.supabase.co")).toBe("https://abc.supabase.co");
    expect(validarUrlSupabase(" https://abc.supabase.co/ ")).toBe("https://abc.supabase.co");
  });
  it("rejeita qualquer caminho, query ou fragmento", () => {
    expect(() => validarUrlSupabase("https://abc.supabase.co/rest/v1/")).toThrow(/rest\/v1/);
    expect(() => validarUrlSupabase("https://abc.supabase.co/auth/v1")).toThrow(/sem caminho/);
    expect(() => validarUrlSupabase("https://abc.supabase.co?x=1")).toThrow(/sem caminho/);
  });
  it("rejeita valor que não é URL", () => {
    expect(() => validarUrlSupabase("abc.supabase.co")).toThrow(/não é uma URL válida/);
  });
});
