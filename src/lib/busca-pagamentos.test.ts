import { describe, expect, it } from "vitest";
import { casaBusca, casaValor, filtrarGrupos, normalizarBusca } from "./busca-pagamentos";

const aluguel = { nome: "Aluguel da Sede — Imobiliária São José", observacao: "Reajuste anual", valor: 120000 };
const energia = { nome: "Energia elétrica", observacao: "Conta de OUTUBRO", valor: 18400.5 };

describe("normalizarBusca", () => {
  it("sem acento, minúsculas, espaços colapsados", () => {
    expect(normalizarBusca("  Imobiliária   SÃO  José ")).toBe("imobiliaria sao jose");
    expect(normalizarBusca(null)).toBe("");
  });
});

describe("casaBusca: texto", () => {
  it("ignora acento e maiúsculas, no nome e na observação", () => {
    expect(casaBusca(aluguel, "imobiliaria sao jose")).toBe(true);
    expect(casaBusca(aluguel, "SÃO JOSÉ")).toBe(true);
    expect(casaBusca(energia, "eletrica")).toBe(true);
    expect(casaBusca(energia, "outubro")).toBe(true);
    expect(casaBusca(aluguel, "reajuste")).toBe(true);
    expect(casaBusca(aluguel, "energia")).toBe(false);
  });
  it("busca vazia casa com tudo", () => {
    expect(casaBusca(aluguel, "   ")).toBe(true);
  });
});

describe("casaBusca: números casam com o valor", () => {
  it("'120000', '120.000', '120.000,00', 'R$ 120.000' e parcial '120'", () => {
    for (const q of ["120000", "120.000", "120.000,00", "R$ 120.000", "120"]) expect(casaBusca(aluguel, q), q).toBe(true);
    expect(casaBusca(energia, "120000")).toBe(false);
  });
  it("centavos: '18.400,5' e '18400,50' casam; '18.400,6' não", () => {
    expect(casaValor(18400.5, "18.400,5")).toBe(true);
    expect(casaValor(18400.5, "18400,50")).toBe(true);
    expect(casaValor(18400.5, "18.400,6")).toBe(false);
  });
  it("sem valor ou termo que não é número: não casa pelo valor", () => {
    expect(casaValor(undefined, "120")).toBe(false);
    expect(casaValor(120000, "12a")).toBe(false);
  });
});

describe("filtrarGrupos", () => {
  const grupos = [
    { chave: "2026-11", rotulo: "Novembro de 2026", itens: [aluguel, energia] },
    { chave: "2026-10", rotulo: "Outubro de 2026", itens: [energia] },
  ];
  it("filtra dentro de cada mês e some com os meses vazios", () => {
    expect(filtrarGrupos(grupos, "aluguel").map((g) => [g.chave, g.itens.length])).toEqual([["2026-11", 1]]);
    expect(filtrarGrupos(grupos, "energia").map((g) => g.chave)).toEqual(["2026-11", "2026-10"]);
    expect(filtrarGrupos(grupos, "inexistente")).toEqual([]); // a tela mostra "Nada encontrado."
    expect(filtrarGrupos(grupos, "")).toEqual(grupos);
  });
});
