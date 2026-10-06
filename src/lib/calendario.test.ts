import { describe, expect, it } from "vitest";
import { coberturaCalendario, diaUtilAnterior, diaUtilMaisProximo, ehDiaUtil, grupoDoMes, hoje } from "./calendario";

describe("ehDiaUtil", () => {
  it("fim de semana, feriado e facultativo não são úteis", () => {
    expect(ehDiaUtil("2026-10-09")).toBe(true); // sexta
    expect(ehDiaUtil("2026-10-10")).toBe(false); // sábado
    expect(ehDiaUtil("2026-10-12")).toBe(false); // feriado
    expect(ehDiaUtil("2026-02-16")).toBe(false); // facultativo (carnaval)
  });
});

describe("diaUtilMaisProximo", () => {
  it("sábado volta para sexta", () => expect(diaUtilMaisProximo("2026-10-10")).toBe("2026-10-09"));
  it("empate sex 09 vs ter 13 (seg 12 feriado) → anterior", () => expect(diaUtilMaisProximo("2026-10-11")).toBe("2026-10-09"));
  it("domingo feriado → segunda", () => expect(diaUtilMaisProximo("2026-11-15")).toBe("2026-11-16"));
  it("dia útil retorna ele mesmo", () => expect(diaUtilMaisProximo("2026-11-10")).toBe("2026-11-10"));
});

describe("diaUtilAnterior", () => {
  it("estritamente antes, pulando fim de semana", () => expect(diaUtilAnterior("2026-10-12")).toBe("2026-10-09"));
  it("de um dia útil volta para o anterior", () => expect(diaUtilAnterior("2026-10-14")).toBe("2026-10-13"));
});

describe("hoje / grupoDoMes / cobertura", () => {
  it("hoje usa America/Sao_Paulo (UTC 02:00 ainda é o dia anterior)", () => {
    expect(hoje(new Date("2026-10-06T02:00:00Z"))).toBe("2026-10-05");
  });
  it("grupo de mês em PT-BR", () => expect(grupoDoMes("2026-10-09")).toBe("Outubro 2026"));
  it("cobertura ok até 2027-12-25 − 90", () => {
    expect(coberturaCalendario("2026-10-05")).toBeNull();
    expect(coberturaCalendario("2027-10-01")).toMatch(/Feriados/);
  });
});

describe("dataPorExtenso", () => {
  it("PT-BR com dia da semana capitalizado", async () => {
    const { dataPorExtenso } = await import("./calendario");
    expect(dataPorExtenso("2026-10-06")).toBe("Terça-feira, 6 de outubro de 2026");
    expect(dataPorExtenso("2027-03-01")).toBe("Segunda-feira, 1 de março de 2027");
  });
});

describe("saudação e hora (São Paulo)", () => {
  it("limites 12h e 18h", async () => {
    const { saudacao } = await import("./calendario");
    expect(saudacao(0)).toBe("Bom dia");
    expect(saudacao(11)).toBe("Bom dia");
    expect(saudacao(12)).toBe("Boa tarde");
    expect(saudacao(17)).toBe("Boa tarde");
    expect(saudacao(18)).toBe("Boa noite");
    expect(saudacao(23)).toBe("Boa noite");
  });
  it("horaMinuto usa America/Sao_Paulo (UTC-3) e formata 09h05", async () => {
    const { horaMinuto, formatarHoraMinuto } = await import("./calendario");
    expect(horaMinuto(new Date("2026-10-06T12:05:00Z"))).toEqual({ h: 9, m: 5 });
    expect(horaMinuto(new Date("2026-10-06T02:30:00Z"))).toEqual({ h: 23, m: 30 });
    expect(formatarHoraMinuto({ h: 9, m: 5 })).toBe("09h05");
  });
});

describe("proximoDiaUtil / diasEntre / rotuloDia", () => {
  it("pula fim de semana e feriado (seg 12/10/2026)", async () => {
    const { proximoDiaUtil, diasEntre, rotuloDia } = await import("./calendario");
    expect(proximoDiaUtil("2026-10-09")).toBe("2026-10-13");
    expect(proximoDiaUtil("2026-10-06")).toBe("2026-10-07");
    expect(diasEntre("2026-10-05", "2026-10-06")).toBe(1);
    expect(diasEntre("2026-10-06", "2026-10-01")).toBe(-5);
    expect(diasEntre("2026-12-31", "2027-01-02")).toBe(2);
    expect(rotuloDia("2026-10-10")).toBe("sáb. 10/10");
  });
});
