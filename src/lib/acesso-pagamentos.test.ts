// Regra da prévia da aba Pagamentos: oculta para todos, aberta por URL só para os e-mails de abas.previa_para.
import { describe, expect, it } from "vitest";
import raw from "../../config/jornal.config.json";
import { acessoPagamentos, getConfig, validarConfig } from "./config";

const MARCOS = "marcos.porto@brbseguros.com.br";
const oculta = (previa: string[]) => validarConfig({ ...raw, abas: { pagamentos: false, previa_para: previa } });
const visivel = validarConfig({ ...raw, abas: { pagamentos: true, previa_para: [] } });

describe("acessoPagamentos", () => {
  it("config real: aba oculta e a prévia é só do Marcos", () => {
    const cfg = getConfig();
    expect(cfg.abas.pagamentos).toBe(false);
    expect(cfg.abas.previa_para).toEqual([MARCOS]);
    expect(acessoPagamentos(MARCOS, cfg)).toEqual({ pode: true, oculta: true });
    for (const outro of cfg.leitores.map((l) => l.email).filter((e) => e !== MARCOS)) expect(acessoPagamentos(outro, cfg).pode, outro).toBe(false);
  });
  it("oculta: e-mail da prévia abre (sem diferenciar maiúsculas e espaços); qualquer outro, vazio ou ausente, não", () => {
    const cfg = oculta([MARCOS]);
    expect(acessoPagamentos("  Marcos.Porto@BRBSeguros.com.br ", cfg).pode).toBe(true);
    expect(acessoPagamentos("egidio@x.com", cfg).pode).toBe(false);
    expect(acessoPagamentos("", cfg).pode).toBe(false);
    expect(acessoPagamentos(null, cfg).pode).toBe(false);
    expect(acessoPagamentos(undefined, cfg).pode).toBe(false);
  });
  it("oculta com a lista vazia: ninguém abre", () => {
    expect(acessoPagamentos(MARCOS, oculta([])).pode).toBe(false);
  });
  it("visível: qualquer leitor abre e não há aviso de 'em construção'", () => {
    expect(acessoPagamentos("egidio@x.com", visivel)).toEqual({ pode: true, oculta: false });
  });
  it("a config valida previa_para (lista de e-mails, obrigatória)", () => {
    expect(() => validarConfig({ ...raw, abas: { pagamentos: false } })).toThrow(/previa_para/);
    expect(() => validarConfig({ ...raw, abas: { pagamentos: false, previa_para: ["sem-arroba"] } })).toThrow(/previa_para/);
    expect(() => validarConfig({ ...raw, abas: { pagamentos: false, previa_para: "marcos" } })).toThrow(/previa_para/);
  });
});
