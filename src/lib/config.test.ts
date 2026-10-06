import { describe, expect, it } from "vitest";
import raw from "../../config/jornal.config.json";
import { ConfigError, ehLeitor, validarConfig } from "./config";

describe("leitores", () => {
  it("compara e-mails sem diferenciar maiúsculas e ignorando espaços", () => {
    expect(ehLeitor("egidio.pelucio@brbseguros.com.br")).toBe(true);
    expect(ehLeitor("  Marcos.Porto@BRBSeguros.com.br ")).toBe(true);
    expect(ehLeitor("outra.pessoa@brbseguros.com.br")).toBe(false);
    expect(ehLeitor(null)).toBe(false);
    expect(ehLeitor("")).toBe(false);
  });

  it("config inválida: leitores vazio, e-mail inválido ou duplicado", () => {
    expect(() => validarConfig({ ...raw, leitores: [] })).toThrow(ConfigError);
    expect(() => validarConfig({ ...raw, leitores: ["nao-e-email"] })).toThrow(/leitores\[0\]/);
    expect(() => validarConfig({ ...raw, leitores: ["a@b.com", "A@B.com"] })).toThrow(/duplicado/);
    expect(() => validarConfig({ ...raw, leitores: undefined })).toThrow(/"leitores" deve ser array/);
  });
});
