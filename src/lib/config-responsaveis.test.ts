import { describe, expect, it } from "vitest";
import raw from "../../config/jornal.config.json";
import { ConfigError, getConfig, validarConfig } from "./config";

const comGestor = (extra: Record<string, unknown>) => ({ ...raw, gestores: [{ ...raw.gestores[0], ...extra }, ...raw.gestores.slice(1)] });

describe("config: coordenacoes", () => {
  it("mapa do config carregado", () => {
    expect(getConfig().coordenacoes).toEqual({
      Superintendência: "Solange Mata",
      "Adm. e Financeira": "Keite Martins",
      Controladoria: "João Silva",
      "Contábil e Fiscal": "Graziely Palma",
    });
  });
  it("rejeita ausente, não-objeto e gestor que não existe no config", () => {
    expect(() => validarConfig({ ...raw, coordenacoes: undefined })).toThrow(ConfigError);
    expect(() => validarConfig({ ...raw, coordenacoes: [] })).toThrow(/coordenacoes/);
    expect(() => validarConfig({ ...raw, coordenacoes: { Controladoria: "Fulano de Tal" } })).toThrow(/Fulano de Tal/);
    expect(() => validarConfig({ ...raw, coordenacoes: { Controladoria: 3 } })).toThrow(/coordenacoes\["Controladoria"\]/);
  });
});

describe("config: whatsapp (opcional)", () => {
  it("ausente para todos hoje", () => expect(getConfig().gestores.every((g) => g.whatsapp === undefined)).toBe(true));
  it("aceita dígitos com código do país (10 a 15)", () => {
    expect(validarConfig(comGestor({ whatsapp: "5561999999999" })).gestores[0].whatsapp).toBe("5561999999999");
    expect(() => validarConfig(comGestor({ whatsapp: "1234567890" }))).not.toThrow();
  });
  it("rejeita formatação, sinal de mais, letras, curto ou longo demais, e não-string", () => {
    for (const ruim of ["+55 61 99999-9999", "(61) 99999-9999", "55619999a9999", "123456789", "1234567890123456", "", 5561999999999]) {
      expect(() => validarConfig(comGestor({ whatsapp: ruim })), String(ruim)).toThrow(/whatsapp/);
    }
  });
});
