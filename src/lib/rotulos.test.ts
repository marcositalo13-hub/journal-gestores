import { describe, expect, it } from "vitest";
import { valorMonday } from "./coletor/aplicar";
import { parseFrequencia } from "./recorrencia";
import { RotuloNaoResolvido, mesmoRotulo, normalizarRotulo, parseRotulosDaColuna, resolverRotulo } from "./rotulos";

describe("normalizarRotulo", () => {
  it("tira espaços, prefixo numérico, caixa e acento", () => {
    expect(normalizarRotulo("4. Mensal")).toBe("mensal");
    expect(normalizarRotulo("4 - mensal")).toBe("mensal");
    expect(normalizarRotulo("4) Mensal")).toBe("mensal");
    expect(normalizarRotulo("12 – Mensal")).toBe("mensal");
    expect(normalizarRotulo(" Mensal ")).toBe("mensal");
    expect(normalizarRotulo("MENSAL")).toBe("mensal");
    expect(normalizarRotulo("1. Não recorrente")).toBe("nao recorrente");
    expect(normalizarRotulo("2. Diária")).toBe("diaria");
    expect(normalizarRotulo("  Não   Recorrente ")).toBe("nao recorrente");
  });
  it("não apaga números que fazem parte do nome", () => {
    expect(normalizarRotulo("2026 Plano")).toBe("2026 plano");
    expect(normalizarRotulo("Fase 2")).toBe("fase 2");
  });
  it("vazio/nulo → string vazia; mesmoRotulo nunca casa vazios", () => {
    expect(normalizarRotulo(null)).toBe("");
    expect(normalizarRotulo(undefined)).toBe("");
    expect(mesmoRotulo("", "  ")).toBe(false);
    expect(mesmoRotulo("4. Mensal", "mensal")).toBe(true);
    expect(mesmoRotulo("Mensal", "Anual")).toBe(false);
  });
});

describe("parseFrequencia com rótulos renomeados", () => {
  const casos: [string, ReturnType<typeof parseFrequencia>][] = [
    ["4. Mensal", "Mensal"],
    ["4 - mensal", "Mensal"],
    [" Mensal ", "Mensal"],
    ["MENSAL", "Mensal"],
    ["4) Mensal", "Mensal"],
    ["3. Quinzenal", "Quinzenal"],
    ["Semanal", "Semanal"],
    ["5. Anual", "Anual"],
    ["1. Não recorrente", "nao_recorrente"],
    ["Nao recorrente", "nao_recorrente"],
    ["2. Diária", "diaria"],
    ["diaria", "diaria"],
    ["Bimestral", null],
    ["", null],
  ];
  for (const [entrada, esperado] of casos) it(`"${entrada}" → ${esperado}`, () => expect(parseFrequencia(entrada)).toBe(esperado));
});

describe("parseRotulosDaColuna / resolverRotulo", () => {
  const status = JSON.stringify({ labels: { "0": "Em andamento", "17": "Não iniciado", "105": "Regra recorrente", "99": "" } });
  const dropdown = JSON.stringify({ labels: [{ id: 5, name: "4. Mensal" }, { id: 3, name: "Semanal" }] });

  it("status: ID = chave do mapa; ignora rótulos vazios", () => {
    expect(parseRotulosDaColuna("status", status)).toEqual([
      { id: 0, nome: "Em andamento" },
      { id: 17, nome: "Não iniciado" },
      { id: 105, nome: "Regra recorrente" },
    ]);
  });
  it("dropdown: id e name", () => expect(parseRotulosDaColuna("dropdown", dropdown)).toEqual([{ id: 5, nome: "4. Mensal" }, { id: 3, nome: "Semanal" }]));
  it("outros tipos e JSON inválido → undefined", () => {
    expect(parseRotulosDaColuna("text", "{}")).toBeUndefined();
    expect(parseRotulosDaColuna("status", "{nao-e-json")).toBeUndefined();
  });
  it("resolve pelo nome normalizado: depois de renomear o ID continua o mesmo", () => {
    const antes = parseRotulosDaColuna("status", status);
    const depois = parseRotulosDaColuna("status", JSON.stringify({ labels: { "17": "0. Não iniciado" } }));
    expect(resolverRotulo(antes, "Não iniciado")?.id).toBe(17);
    expect(resolverRotulo(depois, "Não iniciado")?.id).toBe(17);
    expect(resolverRotulo(depois, "Regra recorrente")).toBeNull();
    expect(resolverRotulo(undefined, "Não iniciado")).toBeNull();
  });
});

describe("valorMonday: status e dropdown por ID", () => {
  const st = { id: "st", type: "status", titulo: "Status", rotulos: [{ id: 17, nome: "0. Não iniciado" }] };
  const dd = { id: "rec", type: "dropdown", titulo: "Recorrência", rotulos: [{ id: 5, nome: "4. Mensal" }, { id: 3, nome: "Semanal" }] };
  it("status → {index}; dropdown → {ids}", () => {
    expect(valorMonday(st, { label: "Não iniciado" })).toEqual({ index: 17 });
    expect(valorMonday(dd, { labels: ["mensal", "Semanal"] })).toEqual({ ids: [5, 3] });
    expect(valorMonday(dd, { labels: [] })).toEqual({ ids: [] });
  });
  it("rótulo inexistente lança RotuloNaoResolvido (nunca grava por texto)", () => {
    expect(() => valorMonday(st, { label: "Concluído" })).toThrow(RotuloNaoResolvido);
    expect(() => valorMonday({ id: "st", type: "status" }, { label: "Não iniciado" })).toThrow(/não existe na coluna/);
  });
  it("tipos simples continuam iguais", () => {
    expect(valorMonday({ id: "d", type: "date" }, { date: "2026-11-09" })).toEqual({ date: "2026-11-09" });
    expect(valorMonday({ id: "t", type: "text" }, { text: "oi" })).toBe("oi");
    expect(valorMonday({ id: "n", type: "numbers" }, { number: 80000 })).toBe("80000");
  });
});
