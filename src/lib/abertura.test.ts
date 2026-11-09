import { describe, expect, it } from "vitest";
import { CHAVE_ABERTURA, deveMostrarAbertura, diaNoFuso, scriptAbertura } from "./abertura";

const FUSO = "America/Sao_Paulo";

describe("dia no fuso de São Paulo", () => {
  it("vira à meia-noite de São Paulo, não à de UTC", () => {
    expect(diaNoFuso(new Date("2026-11-10T02:30:00Z"), FUSO)).toBe("2026-11-09"); // 23h30 do dia 9 em SP
    expect(diaNoFuso(new Date("2026-11-10T03:00:00Z"), FUSO)).toBe("2026-11-10"); // meia-noite em SP
  });
});

describe("deveMostrarAbertura", () => {
  it("mostra se nada foi guardado ou se foi outro dia; não mostra no mesmo dia", () => {
    expect(deveMostrarAbertura(null, "2026-11-09")).toBe(true);
    expect(deveMostrarAbertura(undefined, "2026-11-09")).toBe(true);
    expect(deveMostrarAbertura("2026-11-08", "2026-11-09")).toBe(true);
    expect(deveMostrarAbertura("2026-11-09", "2026-11-09")).toBe(false);
  });
});

// Executa o script inline com um navegador falso para provar o comportamento de ponta a ponta.
function abrirPagina(armazenamento: Map<string, string>, agora: Date, bloqueado = false) {
  const atributos = new Map<string, string>();
  const documentElement = { setAttribute: (k: string, v: string) => atributos.set(k, v) };
  const localStorage = {
    getItem: (k: string) => {
      if (bloqueado) throw new Error("bloqueado");
      return armazenamento.get(k) ?? null;
    },
  };
  class DataFixa extends Date {
    constructor() {
      super(agora);
    }
  }
  new Function("document", "localStorage", "Date", scriptAbertura(FUSO))({ documentElement }, localStorage, DataFixa);
  const dia = atributos.get("data-intro") ?? null;
  if (dia) armazenamento.set(CHAVE_ABERTURA, dia); // o componente grava o dia ao começar a abertura
  return dia;
}

describe("a abertura aparece no máximo uma vez por dia", () => {
  it("primeira abertura mostra; recarregar e reabrir no mesmo dia não; no dia seguinte volta", () => {
    const guardado = new Map<string, string>();
    expect(abrirPagina(guardado, new Date("2026-11-09T12:00:00Z"))).toBe("2026-11-09"); // primeira do dia
    expect(abrirPagina(guardado, new Date("2026-11-09T12:00:05Z"))).toBeNull(); // recarregou
    expect(abrirPagina(guardado, new Date("2026-11-09T20:00:00Z"))).toBeNull(); // reabriu à tarde
    expect(abrirPagina(guardado, new Date("2026-11-10T02:59:00Z"))).toBeNull(); // 23h59 em SP: ainda dia 9
    expect(abrirPagina(guardado, new Date("2026-11-10T11:00:00Z"))).toBe("2026-11-10"); // outro dia
    expect(guardado.get(CHAVE_ABERTURA)).toBe("2026-11-10");
  });

  it("usa o dia de São Paulo, não o de UTC", () => {
    expect(abrirPagina(new Map(), new Date("2026-11-10T01:00:00Z"))).toBe("2026-11-09"); // 22h em SP
  });

  it("armazenamento bloqueado (try/catch): nunca mostra e nunca quebra a página", () => {
    expect(abrirPagina(new Map(), new Date("2026-11-09T12:00:00Z"), true)).toBeNull();
  });

  it("a chave é pauta:intro", () => {
    expect(CHAVE_ABERTURA).toBe("pauta:intro");
  });
});
