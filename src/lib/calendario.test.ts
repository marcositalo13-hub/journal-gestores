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
