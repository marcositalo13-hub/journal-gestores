import { describe, expect, it } from "vitest";
import { tituloAvisoNaoUtil } from "./calendario";
import { getConfig } from "./config";
import { dataDeTeste } from "./edicao/data-dev";
import { contagem, dataCurta, etapasTexto, haDias, inicialDoDia, moeda, numeroDoDia, plural, semPrazoTexto, venceEm } from "./formato";

const cfg = getConfig();

describe("moeda", () => {
  it("R$ pt-BR com duas casas e milhar", () => {
    expect(moeda(80000)).toBe("R$ 80.000,00");
    expect(moeda(1234.5)).toBe("R$ 1.234,50");
    expect(moeda(0)).toBe("R$ 0,00");
    expect(moeda(1_250_000.99)).toBe("R$ 1.250.000,99");
  });
  it("usa espaço comum (sem NBSP)", () => expect(moeda(10)).not.toMatch(/ /));
});

describe("dataCurta", () => {
  it("dia da semana abreviado, dia sem zero, mês abreviado", () => {
    expect(dataCurta("2026-10-09")).toBe("sex., 9 de out.");
    expect(dataCurta("2026-10-10")).toBe("sáb., 10 de out.");
    expect(dataCurta("2026-12-25")).toBe("sex., 25 de dez.");
    expect(dataCurta("2027-03-01")).toBe("seg., 1 de mar.");
  });
  it("inicial e número do dia", () => {
    expect(["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"].map(inicialDoDia).join("")).toBe("DSTQQSS");
    expect(numeroDoDia("2026-10-09")).toBe(9);
    expect(numeroDoDia("2026-10-10")).toBe(10);
  });
});

describe("plurais", () => {
  it("plural / contagem", () => {
    expect(plural(1, "item", "itens")).toBe("item");
    expect(plural(0, "item", "itens")).toBe("itens");
    expect(contagem(1, "item", "itens")).toBe("1 item");
    expect(contagem(3, "item", "itens")).toBe("3 itens");
  });
  it("haDias", () => {
    expect(haDias(1)).toBe("há 1 dia");
    expect(haDias(5)).toBe("há 5 dias");
  });
  it("venceEm", () => {
    expect(venceEm(0)).toBe("vence hoje");
    expect(venceEm(1)).toBe("vence amanhã");
    expect(venceEm(7)).toBe("vence em 7 dias");
  });
  it("etapasTexto e semPrazoTexto", () => {
    expect(etapasTexto({ total: 3, concluidas: 1 })).toBe("1 de 3 etapas");
    expect(etapasTexto({ total: 1, concluidas: 0 })).toBe("0 de 1 etapa");
    expect(semPrazoTexto(1)).toBe("1 item sem prazo");
    expect(semPrazoTexto(4)).toBe("4 itens sem prazo");
  });
});

describe("tituloAvisoNaoUtil", () => {
  it("sexta comum → fim de semana", () => expect(tituloAvisoNaoUtil("2026-10-16", "2026-10-19", cfg)).toBe("Antes do fim de semana"));
  it("sexta com segunda feriado → feriado", () => expect(tituloAvisoNaoUtil("2026-10-09", "2026-10-13", cfg)).toBe("Antes do feriado"));
  it("véspera de feriado em dia de semana → feriado", () => expect(tituloAvisoNaoUtil("2026-11-19", "2026-11-23", cfg)).toBe("Antes do feriado"));
  it("feriado que cai no domingo continua sendo fim de semana", () => expect(tituloAvisoNaoUtil("2026-11-13", "2026-11-16", cfg)).toBe("Antes do fim de semana"));
});

describe("dataDeTeste (?data=)", () => {
  it("só fora de produção e com data válida", () => {
    expect(dataDeTeste("2026-10-09", "development")).toBe("2026-10-09");
    expect(dataDeTeste("2026-10-09", undefined)).toBe("2026-10-09");
    expect(dataDeTeste("2026-10-09", "production")).toBeNull();
    expect(dataDeTeste("2026-02-30", "development")).toBeNull();
    expect(dataDeTeste("amanhã", "development")).toBeNull();
    expect(dataDeTeste(undefined, "development")).toBeNull();
    expect(dataDeTeste(["2026-10-16", "x"], "development")).toBe("2026-10-16");
  });
});

describe("dataTitulo", () => {
  it("dia da semana sem '-feira', mês por extenso", async () => {
    const { dataTitulo } = await import("./formato");
    expect(dataTitulo("2026-10-09")).toBe("Sexta, 9 de outubro");
    expect(dataTitulo("2026-10-12")).toBe("Segunda, 12 de outubro");
    expect(dataTitulo("2027-03-06")).toBe("Sábado, 6 de março");
  });
});
