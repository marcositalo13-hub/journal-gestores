import { describe, expect, it } from "vitest";
import { getConfig, type JornalConfig } from "../config";
import type { ItemJornal } from "./itens";
import { descendentes, montarEdicao } from "./montar";

const cfg = getConfig();
const GERADO = "2026-10-06T14:50:00.000Z";
let n = 0;
const mk = (o: Partial<ItemJornal> & { data: string }): ItemJornal => {
  n++;
  return {
    id: `i${n}`,
    nome: `Item ${n}`,
    quadroId: "1",
    tipoQuadro: "atividades",
    dono: "Solange Mata",
    tipo: "Atividade",
    status: "Em andamento",
    categoria: "aberto",
    updatedAt: "2026-10-01T00:00:00Z",
    ...o,
  };
};
const ed = (itens: ItemJornal[], hoje = "2026-10-06", c: JornalConfig = cfg) => montarEdicao(itens, hoje, c, GERADO);
const ids = (xs: ItemJornal[]) => xs.map((x) => x.id);

describe("metadados", () => {
  it("repassa data e geradoEm", () => {
    const e = ed([]);
    expect(e.data).toBe("2026-10-06");
    expect(e.geradoEm).toBe(GERADO);
    expect(e.manchete).toBeNull();
    expect(e.avisoNaoUtil).toBeNull();
    expect(e.semana).toHaveLength(7);
  });
});

describe("hoje", () => {
  it("só itens de hoje; concluídos entram (por último); cancelados nunca", () => {
    const concl = mk({ data: "2026-10-06", categoria: "concluido", status: "Concluído", nome: "A concluído" });
    const abto = mk({ data: "2026-10-06", nome: "Z aberto" });
    const trav = mk({ data: "2026-10-06", categoria: "travado", status: "Travado", nome: "M travado" });
    const canc = mk({ data: "2026-10-06", categoria: "cancelado", status: "Cancelado" });
    const outro = mk({ data: "2026-10-07" });
    const e = ed([concl, abto, trav, canc, outro]);
    expect(ids(e.hoje)).toEqual([trav.id, abto.id, concl.id]);
    expect(e.hoje.at(-1)?.categoria).toBe("concluido");
  });
});

describe("pendências", () => {
  it("data < hoje, aberto/travado, mais antigas primeiro, com diasAtraso", () => {
    const a = mk({ data: "2026-10-05" });
    const b = mk({ data: "2026-10-01", categoria: "travado", status: "Travado" });
    const concl = mk({ data: "2026-10-02", categoria: "concluido" });
    const canc = mk({ data: "2026-10-03", categoria: "cancelado" });
    const hojeAberto = mk({ data: "2026-10-06" });
    const e = ed([a, b, concl, canc, hojeAberto]);
    expect(e.pendencias.map((p) => [p.item.id, p.diasAtraso])).toEqual([
      [b.id, 5],
      [a.id, 1],
    ]);
  });
  it("diasAtraso conta dias corridos (inclui fim de semana)", () => {
    const e = ed([mk({ data: "2026-10-09" })], "2026-10-13");
    expect(e.pendencias[0].diasAtraso).toBe(4);
  });
});

describe("travados", () => {
  it("qualquer data; motivo vem da observação; diasTravado null; cancelados fora", () => {
    const passado = mk({ data: "2026-09-20", categoria: "travado", observacao: "Aguardando parecer" });
    const futuro = mk({ data: "2026-10-30", categoria: "travado" });
    const canc = mk({ data: "2026-10-10", categoria: "cancelado", status: "Cancelado" });
    const e = ed([futuro, passado, canc]);
    expect(e.travados.map((t) => [t.item.id, t.motivo, t.diasTravado])).toEqual([
      [passado.id, "Aguardando parecer", null],
      [futuro.id, null, null],
    ]);
  });
});

describe("avisoNaoUtil", () => {
  const sab = () => mk({ data: "2026-10-10", nome: "Sábado" });
  const seg = () => mk({ data: "2026-10-12", nome: "Segunda (feriado)", categoria: "travado" });

  it("sexta 2026-10-09: itens de sáb 10/10 e seg 12/10 (feriado), até o próximo dia útil (ter 13/10, exclusivo)", () => {
    const s = sab();
    const m = seg();
    const dom = mk({ data: "2026-10-11", categoria: "concluido" });
    const canc = mk({ data: "2026-10-11", categoria: "cancelado" });
    const ter = mk({ data: "2026-10-13" });
    const sexta = mk({ data: "2026-10-09" });
    const e = ed([m, s, dom, canc, ter, sexta], "2026-10-09");
    expect(e.avisoNaoUtil?.proximoDiaUtil).toBe("2026-10-13");
    expect(e.avisoNaoUtil?.itens.map((x) => [x.item.id, x.rotulo])).toEqual([
      [s.id, "sáb. 10/10"],
      [m.id, "seg. 12/10"],
    ]);
  });

  it("terça: nenhum aviso (amanhã é dia útil)", () => {
    expect(ed([sab(), seg()], "2026-10-06").avisoNaoUtil).toBeNull();
  });

  it("sexta sem itens no fim de semana: null", () => {
    expect(ed([mk({ data: "2026-10-13" })], "2026-10-09").avisoNaoUtil).toBeNull();
  });

  it("hoje não útil (sábado): null", () => {
    expect(ed([mk({ data: "2026-10-11" })], "2026-10-10").avisoNaoUtil).toBeNull();
  });

  it("véspera de feriado: quinta 19/11 → sexta 20/11 é feriado; vale até seg 23/11", () => {
    const f = mk({ data: "2026-11-20" });
    const e = ed([f], "2026-11-19");
    expect(e.avisoNaoUtil?.proximoDiaUtil).toBe("2026-11-23");
    expect(e.avisoNaoUtil?.itens.map((x) => x.rotulo)).toEqual(["sex. 20/11"]);
  });
});

describe("semana", () => {
  it("hoje+1 … hoje+7, só itens em aberto (aberto/travado)", () => {
    const a = mk({ data: "2026-10-07" });
    const concl = mk({ data: "2026-10-07", categoria: "concluido" });
    const limite = mk({ data: "2026-10-13", categoria: "travado" });
    const fora = mk({ data: "2026-10-14" });
    const hojeI = mk({ data: "2026-10-06" });
    const canc = mk({ data: "2026-10-08", categoria: "cancelado" });
    const e = ed([a, concl, limite, fora, hojeI, canc]);
    expect(e.semana.map((d) => d.data)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
    expect(ids(e.semana[0].itens)).toEqual([a.id]);
    expect(e.semana[1].itens).toEqual([]);
    expect(ids(e.semana[6].itens)).toEqual([limite.id]);
    expect(e.semana.map((d) => d.ehDiaUtil)).toEqual([true, true, true, false, false, false, true]);
    expect(e.semana[3].rotulo).toBe("sáb. 10/10");
  });
});

describe("manchete", () => {
  const pag = (valor: number, data: string, o: Partial<ItemJornal> = {}) => mk({ tipo: "Pagamento", tipoQuadro: "pagamentos", valor, data, ...o });
  const con = (data: string, o: Partial<ItemJornal> = {}) => mk({ tipo: "Contrato", data, ...o });
  const pend = () => mk({ data: "2026-10-05", nome: "Pendência" });
  const trav = () => mk({ data: "2026-10-30", categoria: "travado", observacao: "Sem verba" });

  it("precedência a > b > c > d > null", () => {
    const p = pag(150_000, "2026-10-08");
    const c = con("2026-10-10");
    const pe = pend();
    const t = trav();
    expect(ed([t, pe, c, p]).manchete).toMatchObject({ regra: "pagamento", item: { id: p.id } });
    expect(ed([t, pe, c]).manchete).toMatchObject({ regra: "contrato", item: { id: c.id } });
    expect(ed([t, pe]).manchete).toMatchObject({ regra: "pendencia", item: { id: pe.id } });
    expect(ed([t]).manchete).toMatchObject({ regra: "travado", item: { id: t.id }, motivo: "Sem verba" });
    expect(ed([]).manchete).toBeNull();
  });

  it("(a) valor mínimo, janela [hoje, hoje+7], não concluído; maior valor vence", () => {
    expect(ed([pag(99_999, "2026-10-08")]).manchete).toBeNull();
    expect(ed([pag(500_000, "2026-10-14")]).manchete).toBeNull(); // hoje+8
    expect(ed([pag(500_000, "2026-10-13")]).manchete?.regra).toBe("pagamento"); // hoje+7
    expect(ed([pag(500_000, "2026-10-06")]).manchete?.regra).toBe("pagamento"); // hoje
    expect(ed([pag(500_000, "2026-10-05")]).manchete?.regra).toBe("pendencia"); // já venceu: vira pendência
    expect(ed([pag(500_000, "2026-10-08", { categoria: "concluido" })]).manchete).toBeNull();
    const menor = pag(120_000, "2026-10-07");
    const maior = pag(300_000, "2026-10-12");
    expect(ed([menor, maior]).manchete?.item.id).toBe(maior.id);
    expect(ed([pag(100_000, "2026-10-08")]).manchete?.regra).toBe("pagamento"); // limite inclusivo
  });

  it("(b) contrato: janela [hoje, hoje+10]; o mais próximo; não concluído", () => {
    expect(ed([con("2026-10-17")]).manchete).toBeNull(); // hoje+11
    const perto = con("2026-10-08");
    const longe = con("2026-10-16");
    expect(ed([longe, perto]).manchete).toMatchObject({ regra: "contrato", item: { id: perto.id } });
    expect(ed([con("2026-10-08", { categoria: "concluido" })]).manchete).toBeNull();
  });

  it("(c) pendência mais antiga", () => {
    const velha = mk({ data: "2026-09-28" });
    const nova = mk({ data: "2026-10-05" });
    expect(ed([nova, velha]).manchete).toMatchObject({ regra: "pendencia", item: { id: velha.id }, motivo: "Atrasado há 8 dias." });
  });

  it("motivo do pagamento formata o valor em reais", () => {
    expect(ed([pag(150_000, "2026-10-08")]).manchete?.motivo).toBe("Pagamento de R$ 150.000 vence em 2 dias.");
  });
});

describe("itens cancelados nunca aparecem", () => {
  it("em nenhuma seção nem contagem", () => {
    const cancelados = [
      mk({ data: "2026-10-09", categoria: "cancelado" }),
      mk({ data: "2026-10-01", categoria: "cancelado" }),
      mk({ data: "2026-10-10", categoria: "cancelado" }),
      mk({ data: "2026-10-12", categoria: "cancelado" }),
      mk({ tipo: "Pagamento", valor: 900_000, data: "2026-10-12", categoria: "cancelado" }),
      mk({ tipo: "Contrato", data: "2026-10-12", categoria: "cancelado" }),
    ];
    const e = ed(cancelados, "2026-10-09");
    const json = JSON.stringify(e);
    for (const c of cancelados) expect(json).not.toContain(`"${c.id}"`);
    expect(e.manchete).toBeNull();
    expect(e.gestores.find((g) => g.nome === "Solange Mata")?.mes.total).toBe(0);
  });
});

describe("gestores", () => {
  it("todos do config na ordem + donos desconhecidos por último; contagens e mês", () => {
    const itens = [
      mk({ dono: "Lucas Martins", data: "2026-10-06" }), // hoje, aberto
      mk({ dono: "Lucas Martins", data: "2026-10-06", categoria: "concluido" }), // hoje concluído (não conta em contagens.hoje)
      mk({ dono: "Lucas Martins", data: "2026-10-02" }), // atrasado
      mk({ dono: "Lucas Martins", data: "2026-10-03", categoria: "travado" }), // atrasado + travado
      mk({ dono: "Lucas Martins", data: "2026-10-04", categoria: "concluido" }), // mês: concluído
      mk({ dono: "Lucas Martins", data: "2026-10-20" }), // futuro: fora de mes
      mk({ dono: "Lucas Martins", data: "2026-09-30" }), // mês anterior: fora de mes, mas atrasado
      mk({ dono: "TESTE", data: "2026-10-05" }),
    ];
    const g = ed(itens).gestores;
    expect(g.map((x) => x.nome)).toEqual([...cfg.gestores.map((x) => x.nome), "TESTE"]);
    const lucas = g.find((x) => x.nome === "Lucas Martins")!;
    expect(lucas.area).toBe("Gerência de Operações e Suporte ao Cliente");
    expect(lucas.reportaA).toBe("Solange Mata");
    expect(lucas.contagens).toEqual({ hoje: 1, atrasados: 3, travados: 1, semPrazo: 0 });
    expect(lucas.mes).toEqual({ concluidos: 2, total: 5 });
    expect(g.at(-1)).toMatchObject({ nome: "TESTE", area: null, reportaA: null, contagens: { hoje: 0, atrasados: 1, travados: 0, semPrazo: 0 }, mes: { concluidos: 0, total: 1 } });
    expect(g.find((x) => x.nome === "Solange Mata")!.mes).toEqual({ concluidos: 0, total: 0 });
  });
});

describe("descendentes", () => {
  it("Solange Mata inclui toda a equipe, inclusive a de Lucas Martins", () => {
    const d = descendentes("Solange Mata", cfg);
    expect([...d].sort()).toEqual(
      ["Danielle Aquino", "Graziely Palma", "João Silva", "Keite Martins", "Lucas Martins", "Solange Mescouto", "Vanessa Petri"].sort(),
    );
    expect(d).not.toContain("Solange Mata");
  });
  it("Lucas Martins → só a sua equipe; folha → vazio; desconhecido → vazio", () => {
    expect([...descendentes("Lucas Martins", cfg)].sort()).toEqual(["Danielle Aquino", "Vanessa Petri"]);
    expect(descendentes("Vanessa Petri", cfg)).toEqual([]);
    expect(descendentes("Ninguém", cfg)).toEqual([]);
  });
  it("não entra em loop com hierarquia circular", () => {
    const g = (nome: string, reporta_a: string) => ({ nome, area: "x", reporta_a, quadro_id: null });
    const ciclo = { ...cfg, gestores: [g("A", "B"), g("B", "A")] };
    expect(descendentes("A", ciclo)).toEqual(["B"]);
  });
});
