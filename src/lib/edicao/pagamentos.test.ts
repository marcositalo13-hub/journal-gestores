import { describe, expect, it } from "vitest";
import { getConfig } from "../config";
import { fixturePagamentosAtiva } from "./data-dev";
import { fixturePagamentos } from "./fixture-pagamentos";
import type { ItemJornal } from "./itens";
import { montarPagamentos } from "./pagamentos";

const cfg = getConfig();
const HOJE = "2026-11-09"; // segunda-feira
let n = 0;
const pag = (o: Partial<ItemJornal> & { data: string; valor?: number }): ItemJornal => {
  n++;
  return {
    id: `p${n}`,
    nome: `Pag ${n}`,
    quadroId: "100",
    tipoQuadro: "pagamentos",
    dono: "Keite Martins",
    tipo: "Pagamento",
    status: "Previsto",
    categoria: "aberto",
    valor: 1000,
    updatedAt: "2026-11-01T00:00:00Z",
    ...o,
  };
};
const mp = (itens: ItemJornal[], hoje = HOJE) => montarPagamentos(itens, hoje, cfg);

describe("totais do mês", () => {
  it("previsto = não cancelados; pago = concluídos; aPagar = previsto − pago", () => {
    const p = mp([
      pag({ data: "2026-11-02", valor: 1000, categoria: "concluido", status: "Pago" }),
      pag({ data: "2026-11-20", valor: 2500.5 }),
      pag({ data: "2026-11-25", valor: 500, categoria: "travado", status: "Travado" }),
      pag({ data: "2026-11-15", valor: 99999, categoria: "cancelado", status: "Cancelado" }),
      pag({ data: "2026-10-30", valor: 7000 }), // outro mês
    ]);
    expect(p.mesAtual).toEqual({ mes: "2026-11", rotulo: "Novembro", previsto: 4000.5, pago: 1000, aPagar: 3000.5, quantidade: 3 });
  });

  it("próximo mês separado; vira o ano em dezembro", () => {
    const p = mp([pag({ data: "2026-12-10", valor: 80000 }), pag({ data: "2026-12-05", valor: 32000, categoria: "concluido" }), pag({ data: "2027-01-10", valor: 5 })], "2026-12-15");
    expect(p.mesAtual).toMatchObject({ mes: "2026-12", rotulo: "Dezembro", previsto: 112000, pago: 32000, aPagar: 80000 });
    expect(p.proximoMes).toEqual({ mes: "2027-01", rotulo: "Janeiro", previsto: 5, pago: 0, aPagar: 5, quantidade: 1 });
  });

  it("soma em centavos sem erro de ponto flutuante", () => {
    const p = mp([pag({ data: "2026-11-02", valor: 0.1 }), pag({ data: "2026-11-03", valor: 0.2 })]);
    expect(p.mesAtual.previsto).toBe(0.3);
  });

  it("valor ausente conta como zero", () => {
    expect(mp([pag({ data: "2026-11-02", valor: undefined })]).mesAtual.previsto).toBe(0);
  });
});

describe("atrasados", () => {
  it("vencimento < hoje, não pagos nem cancelados, mais antigos primeiro, com dias de atraso", () => {
    const antigo = pag({ data: "2026-10-01" });
    const recente = pag({ data: "2026-11-08" });
    const travado = pag({ data: "2026-10-20", categoria: "travado" });
    const p = mp([
      recente,
      antigo,
      travado,
      pag({ data: "2026-10-05", categoria: "concluido" }),
      pag({ data: "2026-10-06", categoria: "cancelado" }),
      pag({ data: HOJE }), // vence hoje: ainda não atrasado
    ]);
    expect(p.atrasados.map((a) => [a.item.id, a.diasAtraso])).toEqual([
      [antigo.id, 39],
      [travado.id, 20],
      [recente.id, 1],
    ]);
  });
});

describe("saidasPorData (próximos 45 dias)", () => {
  it("agrupa por data com total; só o que ainda sai; limites hoje e hoje+45 inclusivos", () => {
    const a1 = pag({ data: "2026-11-10", valor: 100, nome: "B" });
    const a2 = pag({ data: "2026-11-10", valor: 250.5, nome: "A" });
    const hojeI = pag({ data: HOJE, valor: 10 });
    const limite = pag({ data: "2026-12-24", valor: 7 }); // hoje + 45
    const p = mp([
      a1,
      a2,
      hojeI,
      limite,
      pag({ data: "2026-12-25", valor: 1 }), // hoje + 46: fora
      pag({ data: "2026-11-11", categoria: "concluido" }), // já pago
      pag({ data: "2026-11-12", categoria: "cancelado" }),
      pag({ data: "2026-11-08" }), // passado: é atrasado, não saída
    ]);
    expect(p.saidasPorData.map((s) => [s.data, s.total, s.itens.map((i) => i.nome)])).toEqual([
      [HOJE, 10, [hojeI.nome]],
      ["2026-11-10", 350.5, ["A", "B"]],
      ["2026-12-24", 7, [limite.nome]],
    ]);
  });
  it("rotula o dia e marca dias não úteis; travados ainda são saída", () => {
    const sab = pag({ data: "2026-11-14", categoria: "travado" });
    const p = mp([sab, pag({ data: "2026-11-16" })]);
    expect(p.saidasPorData.map((s) => [s.rotulo, s.ehDiaUtil])).toEqual([["sáb. 14/11", false], ["seg. 16/11", true]]);
  });
});

describe("maiores do mês", () => {
  it("top 5 por valor, não cancelados, só do mês corrente (inclui pagos)", () => {
    const valores = [10, 500, 300, 700, 50, 900, 20];
    const itens = valores.map((valor, i) => pag({ data: `2026-11-${String(i + 2).padStart(2, "0")}`, valor, categoria: valor === 900 ? "concluido" : "aberto" }));
    const p = mp([...itens, pag({ data: "2026-11-30", valor: 10_000_000, categoria: "cancelado" }), pag({ data: "2026-12-01", valor: 5_000 })]);
    expect(p.maioresDoMes.map((i) => i.valor)).toEqual([900, 700, 500, 300, 50]);
  });
  it("empate de valor desempata por data e nome", () => {
    const a = pag({ data: "2026-11-05", valor: 100, nome: "B" });
    const b = pag({ data: "2026-11-03", valor: 100, nome: "Z" });
    expect(mp([a, b]).maioresDoMes.map((i) => i.id)).toEqual([b.id, a.id]);
  });
});

describe("travados", () => {
  it("de qualquer data, com motivo (ou null); cancelados fora", () => {
    const t1 = pag({ data: "2026-10-01", categoria: "travado", observacao: "Aguardando NF" });
    const t2 = pag({ data: "2026-12-30", categoria: "travado" });
    const p = mp([t2, t1, pag({ data: "2026-11-20", categoria: "cancelado" })]);
    expect(p.travados.map((t) => [t.item.id, t.motivo])).toEqual([[t1.id, "Aguardando NF"], [t2.id, null]]);
  });
});

describe("escopo e estado vazio", () => {
  it("só considera quadros de pagamentos; atividades são ignoradas", () => {
    const atividade = pag({ data: "2026-11-10", tipoQuadro: "atividades", tipo: "Atividade", valor: 5000 });
    const p = mp([atividade]);
    expect(p.vazio).toBe(true);
    expect(p.mesAtual.previsto).toBe(0);
    expect(p.saidasPorData).toEqual([]);
  });
  it("vazio: sem pagamentos (ou só cancelados); com pelo menos um, não", () => {
    expect(mp([]).vazio).toBe(true);
    expect(mp([pag({ data: "2026-11-10", categoria: "cancelado" })]).vazio).toBe(true);
    expect(mp([pag({ data: "2026-11-10" })]).vazio).toBe(false);
  });
  it("repassa a data", () => expect(mp([]).data).toBe(HOJE));
});

describe("fixture de desenvolvimento (?fixture=pagamentos)", () => {
  const f = fixturePagamentos(HOJE);
  const p = mp(f);
  it("todos são pagamentos e o cenário cobre todas as seções", () => {
    expect(f.every((i) => i.tipoQuadro === "pagamentos" && i.tipo === "Pagamento")).toBe(true);
    expect(p.vazio).toBe(false);
    expect(p.atrasados.length).toBeGreaterThan(0);
    expect(p.travados).toHaveLength(1);
    expect(p.saidasPorData.length).toBeGreaterThan(3);
    expect(p.maioresDoMes).toHaveLength(5);
    expect(p.mesAtual.pago).toBeGreaterThan(0);
    expect(p.proximoMes.quantidade).toBeGreaterThan(0);
  });
  it("cancelados e fora da janela não aparecem nas saídas", () => {
    const nomes = p.saidasPorData.flatMap((s) => s.itens.map((i) => i.nome)).join("|");
    expect(nomes).not.toContain("cancelado");
    expect(nomes).not.toContain("Fora da janela");
  });
});

describe("?fixture=pagamentos", () => {
  it("só fora de produção e só com o valor exato", () => {
    expect(fixturePagamentosAtiva("pagamentos", "development")).toBe(true);
    expect(fixturePagamentosAtiva("pagamentos", undefined)).toBe(true);
    expect(fixturePagamentosAtiva(["pagamentos", "x"], "development")).toBe(true);
    expect(fixturePagamentosAtiva("pagamentos", "production")).toBe(false);
    expect(fixturePagamentosAtiva("outro", "development")).toBe(false);
    expect(fixturePagamentosAtiva(undefined, "development")).toBe(false);
  });
});
