import { describe, expect, it } from "vitest";
import raw from "../../config/jornal.config.json";
import { ConfigError, ehLeitor, leitorPorEmail, validarConfig } from "./config";

describe("leitores", () => {
  it("compara e-mails sem diferenciar maiúsculas e ignorando espaços", () => {
    expect(ehLeitor("egidio.pelucio@brbseguros.com.br")).toBe(true);
    expect(ehLeitor("  Marcos.Porto@BRBSeguros.com.br ")).toBe(true);
    expect(ehLeitor("outra.pessoa@brbseguros.com.br")).toBe(false);
    expect(ehLeitor(null)).toBe(false);
    expect(ehLeitor("")).toBe(false);
  });

  it("leitorPorEmail devolve o nome para a saudação", () => {
    expect(leitorPorEmail("EGIDIO.pelucio@brbseguros.com.br")?.nome).toBe("Egídio");
    expect(leitorPorEmail("marcos.porto@brbseguros.com.br")?.nome).toBe("Marcos");
    expect(leitorPorEmail("x@y.com")).toBeNull();
  });

  it("config inválida: leitores vazio, e-mail/nome inválido ou duplicado", () => {
    const l = (email: string, nome = "Fulano") => ({ email, nome });
    expect(() => validarConfig({ ...raw, leitores: [] })).toThrow(ConfigError);
    expect(() => validarConfig({ ...raw, leitores: [l("nao-e-email")] })).toThrow(/leitores\[0\]\.email/);
    expect(() => validarConfig({ ...raw, leitores: [l("a@b.com", "")] })).toThrow(/leitores\[0\]\.nome/);
    expect(() => validarConfig({ ...raw, leitores: ["a@b.com"] })).toThrow(/leitores\[0\]/);
    expect(() => validarConfig({ ...raw, leitores: [l("a@b.com"), l("A@B.com")] })).toThrow(/duplicado/);
    expect(() => validarConfig({ ...raw, leitores: undefined })).toThrow(/"leitores" deve ser array/);
  });
});
