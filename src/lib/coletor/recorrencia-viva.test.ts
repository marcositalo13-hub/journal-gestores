// Recorrência no modelo de item único (estilo ClickUp): próxima data, âncora, histórico + avanço, idempotência,
// aplicação (com o monday simulado), webhook e a migração do modelo antigo. Sem rede.
import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas: { query: string; vars: Record<string, unknown> }[] = [];
let falharEm: ((q: string, v: Record<string, unknown>) => boolean) | null = null;
vi.mock("../monday/client", () => ({
  mondayQuery: vi.fn(),
  mondayMutation: vi.fn(async (query: string, vars: Record<string, unknown>) => {
    chamadas.push({ query, vars });
    if (falharEm?.(query, vars)) throw new Error("HTTP 500");
    if (query.includes("create_item")) return { create_item: { id: "novo" } };
    if (query.includes("create_column")) return { create_column: { id: "anc_nova", type: "text", title: "Âncora" } };
    return {};
  }),
}));

import { ancoraEfetiva, proximaData } from "../recorrencia";
import { aplicarPlano } from "./aplicar";
import { acoesRecorrenciaDoItem } from "./executar";
import { CTRL, FINAL, OPER, STATUS, cfg, colunasCom, de, grupos, ler, planoEm, type It } from "./fixture-atividades";
import { planejarMigracao } from "./migracao";

const plano = planoEm("2026-11-16");

beforeEach(() => {
  chamadas.length = 0;
  falharEm = null;
});

describe("próxima data: um período depois do Prazo atual (nunca da conclusão)", () => {
  it("Semanal +7, Quinzenal +14 (atravessa mês e ano)", () => {
    expect(proximaData("Semanal", "2026-11-13", "2026-11-13")).toBe("2026-11-20");
    expect(proximaData("Semanal", "2026-12-29", "2026-12-29")).toBe("2027-01-05");
    expect(proximaData("Quinzenal", "2026-11-20", "2026-11-20")).toBe("2026-12-04");
  });
  it("Mensal: dia da âncora limitado ao fim do mês; 31 → 28/02 → 31/03 (não acumula o limite)", () => {
    expect(proximaData("Mensal", "2027-01-31", "2027-01-31")).toBe("2027-02-28");
    expect(proximaData("Mensal", "2027-02-28", "2027-01-31")).toBe("2027-03-31");
    expect(proximaData("Mensal", "2027-03-31", "2027-01-31")).toBe("2027-04-30");
    expect(proximaData("Mensal", "2028-01-31", "2028-01-31")).toBe("2028-02-29"); // bissexto
    expect(proximaData("Mensal", "2026-12-10", "2026-12-10")).toBe("2027-01-10");
  });
  it("Anual: mesmo dia/mês; 29/02 → 28/02 nos anos comuns e volta a 29 no bissexto", () => {
    expect(proximaData("Anual", "2026-11-18", "2026-11-18")).toBe("2027-11-18");
    expect(proximaData("Anual", "2028-02-29", "2028-02-29")).toBe("2029-02-28");
    expect(proximaData("Anual", "2031-02-28", "2028-02-29")).toBe("2032-02-29");
  });
});

describe("âncora", () => {
  it("vazia ou ilegível → o próprio Prazo (precisa gravar)", () => {
    expect(ancoraEfetiva("Mensal", "2026-11-18", null)).toEqual({ ancora: "2026-11-18", mudou: true });
    expect(ancoraEfetiva("Mensal", "2026-11-18", "lixo")).toEqual({ ancora: "2026-11-18", mudou: true });
  });
  it("Mensal: Prazo no dia ancorado (inclusive o limitado de fevereiro) mantém a âncora", () => {
    expect(ancoraEfetiva("Mensal", "2027-02-28", "2027-01-31")).toEqual({ ancora: "2027-01-31", mudou: false });
    expect(ancoraEfetiva("Mensal", "2026-12-18", "2026-11-18")).toEqual({ ancora: "2026-11-18", mudou: false });
  });
  it("alguém moveu o Prazo à mão: a âncora passa a ser o novo Prazo", () => {
    expect(ancoraEfetiva("Mensal", "2026-12-12", "2026-11-18")).toEqual({ ancora: "2026-12-12", mudou: true });
    expect(ancoraEfetiva("Anual", "2027-03-01", "2026-02-28")).toEqual({ ancora: "2027-03-01", mudou: true });
    expect(ancoraEfetiva("Semanal", "2026-11-21", "2026-11-20")).toEqual({ ancora: "2026-11-21", mudou: true });
  });
});

describe("conclusão: (a) cópia de histórico em finalizadas, (b) o item avança", () => {
  const vivo = (o: Partial<It> = {}): It => ({ id: "77", nome: "Material CONSAD", rec: "4. Mensal", prazo: "2026-11-18", status: "Concluído", grupo: CTRL, area: CTRL, tipo: "Entrega", obs: "Aguardando fechamento", ancora: "2026-11-18", ...o });

  it("Mensal concluído: histórico '· 18/11' com Chave 77:2026-11-18; avança para 18/12 'Não iniciado', âncora mantida", () => {
    const p = plano([vivo()]);
    expect(p.acoesArea.map((a) => a.tipo)).toEqual(["historico_criado", "recorrencia_avancada"]);
    expect(de(p.acoesArea, "historico_criado")[0]).toMatchObject({ nome: "Material CONSAD · 18/11", chave: "77:2026-11-18", data: "2026-11-18", status: "Concluído", area: CTRL, grupo: { titulo: FINAL } });
    expect(de(p.acoesArea, "recorrencia_avancada")[0]).toMatchObject({ de: "2026-11-18", para: "2026-12-18", status: "Não iniciado", ancora: "2026-11-18" });
  });

  it("Mensal dia 31 atravessando fevereiro, com âncora: 31/01 → 28/02 → 31/03", () => {
    const p1 = plano([vivo({ prazo: "2027-01-31", ancora: "2027-01-31" })]);
    expect(de(p1.acoesArea, "recorrencia_avancada")[0]).toMatchObject({ para: "2027-02-28", ancora: "2027-01-31" });
    const p2 = plano([vivo({ prazo: "2027-02-28", ancora: "2027-01-31" })]);
    expect(de(p2.acoesArea, "recorrencia_avancada")[0]).toMatchObject({ para: "2027-03-31", ancora: "2027-01-31" });
    expect(de(p2.acoesArea, "ancora_atualizada")).toEqual([]);
  });

  it("Semanal: +7 e a âncora acompanha o Prazo", () => {
    const p = plano([vivo({ rec: "Semanal", prazo: "2026-11-13", ancora: "2026-11-13" })]);
    expect(de(p.acoesArea, "recorrencia_avancada")[0]).toMatchObject({ de: "2026-11-13", para: "2026-11-20", ancora: "2026-11-20" });
  });

  it("Anual 29/02: avança para 28/02 do ano seguinte guardando a âncora 29/02", () => {
    const p = plano([vivo({ rec: "5. Anual", prazo: "2028-02-29", ancora: "2028-02-29" })]);
    expect(de(p.acoesArea, "recorrencia_avancada")[0]).toMatchObject({ para: "2029-02-28", ancora: "2028-02-29" });
  });

  it("Prazo vencido há semanas: avança um período a partir do Prazo, não da data de conclusão", () => {
    const p = plano([vivo({ prazo: "2026-10-10", ancora: "2026-10-10" })]);
    expect(de(p.acoesArea, "recorrencia_avancada")[0].para).toBe("2026-11-10");
  });

  it("cancelado: histórico com Status Cancelado e o item avança do mesmo jeito", () => {
    const p = plano([vivo({ status: "Cancelado" })]);
    expect(de(p.acoesArea, "historico_criado")[0].status).toBe("Cancelado");
    expect(de(p.acoesArea, "recorrencia_avancada")[0]).toMatchObject({ para: "2026-12-18", status: "Não iniciado", statusAtual: "Cancelado" });
  });

  it("idempotente: se (b) falhou, a cópia com a Chave já existe e o próximo plano só refaz (b)", () => {
    const p = plano([vivo(), { id: "h1", nome: "Material CONSAD · 18/11", chave: "77:2026-11-18", prazo: "2026-11-18", status: "Concluído", grupo: FINAL, area: CTRL, rec: "4. Mensal" }]);
    expect(p.acoesArea.map((a) => a.tipo)).toEqual(["recorrencia_avancada"]);
  });

  it("depois do avanço não há mais nada a fazer (sem churn)", () => {
    const p = plano([
      vivo({ prazo: "2026-12-18", status: "Não iniciado" }),
      { id: "h1", chave: "77:2026-11-18", prazo: "2026-11-18", status: "Concluído", grupo: FINAL, area: CTRL, rec: "4. Mensal" },
    ]);
    expect(p.acoesArea).toEqual([]);
  });

  it("Prazo movido à mão num item aberto: só a âncora é atualizada (e o próximo avanço usa o novo dia)", () => {
    const p = plano([vivo({ status: "Em andamento", prazo: "2026-11-20", ancora: "2026-11-18" })]);
    expect(p.acoesArea).toEqual([{ tipo: "ancora_atualizada", itemId: "77", itemNome: "Material CONSAD", ancora: "2026-11-20", ancoraAtual: "2026-11-18" }]);
    const concluido = plano([vivo({ prazo: "2026-11-20", ancora: "2026-11-18" })]);
    expect(de(concluido.acoesArea, "recorrencia_avancada")[0]).toMatchObject({ para: "2026-12-20", ancora: "2026-11-20" });
  });

  it("sem Prazo, 'Não recorrente', ou já em 'Atividades finalizadas': nenhuma ação de recorrência", () => {
    expect(plano([vivo({ prazo: undefined })]).acoesArea).toEqual([]);
    expect(plano([vivo({ rec: "1. Não recorrente" })]).acoesArea.map((a) => a.tipo)).toEqual([]); // vira item comum (finaliza em 7 dias)
    expect(plano([vivo({ grupo: FINAL })]).acoesArea).toEqual([]);
  });

  it("sem o grupo 'Atividades finalizadas' não há onde guardar o histórico: não avança", () => {
    const p = plano([vivo()], grupos.filter((g) => g.title !== FINAL));
    expect(p.acoesArea).toEqual([]);
  });
});

describe("aplicação (monday simulado)", () => {
  const vivo: It = { id: "77", nome: "Material CONSAD", rec: "4. Mensal", prazo: "2026-11-18", status: "Concluído", grupo: CTRL, area: CTRL, ancora: "2026-11-18" };
  const aplicar = async (itens: It[], cols = colunasCom()) => {
    const q = ler(itens, grupos, cols);
    return aplicarPlano(q, plano(itens, grupos, cols), cfg);
  };

  it("(a) cria a cópia em finalizadas e depois (b) avança o item, nessa ordem", async () => {
    const r = await aplicar([vivo]);
    expect(chamadas.map((c) => (c.query.includes("create_item") ? "create_item" : "change_multiple_column_values"))).toEqual(["create_item", "change_multiple_column_values"]);
    expect(chamadas[0].vars).toMatchObject({ group_id: "g3", nome: "Material CONSAD · 18/11" });
    expect(JSON.parse(chamadas[0].vars.valores as string)).toMatchObject({ ch: "77:2026-11-18", prazo: { date: "2026-11-18" }, st: { index: 1 } });
    expect(JSON.parse(chamadas[1].vars.valores as string)).toEqual({ prazo: { date: "2026-12-18" }, st: { index: 17 }, anc: "2026-11-18" });
    expect(r.historicosCriados).toEqual([{ nome: "Material CONSAD · 18/11", id: "novo", chave: "77:2026-11-18" }]);
    expect(r.recorrenciasAvancadas).toEqual([{ nome: "Material CONSAD", id: "77", de: "2026-11-18", para: "2026-12-18" }]);
    expect(r.falhas).toEqual([]);
  });

  it("se (a) falha, (b) não acontece: nada de avançar sem histórico", async () => {
    falharEm = (q) => q.includes("create_item");
    const r = await aplicar([vivo]);
    expect(chamadas.filter((c) => c.query.includes("change_multiple_column_values"))).toEqual([]);
    expect(r.falhas.map((f) => f.acao)).toEqual(["historico_criado", "recorrencia_avancada"]);
  });

  it("se (b) falha, a falha é registrada; na rodada seguinte o histórico existe e só (b) é refeito", async () => {
    falharEm = (q) => q.includes("change_multiple_column_values");
    const r1 = await aplicar([vivo]);
    expect(r1.historicosCriados).toHaveLength(1);
    expect(r1.falhas.map((f) => f.acao)).toEqual(["recorrencia_avancada"]);
    chamadas.length = 0;
    falharEm = null;
    const r2 = await aplicar([vivo, { id: "novo", nome: "Material CONSAD · 18/11", chave: "77:2026-11-18", prazo: "2026-11-18", status: "Concluído", grupo: FINAL, area: CTRL, rec: "4. Mensal" }]);
    expect(chamadas.map((c) => c.query.includes("create_item"))).toEqual([false]);
    expect(r2.recorrenciasAvancadas).toHaveLength(1);
  });

  it("sem a coluna Âncora: cria a coluna e grava a âncora no id novo", async () => {
    const r = await aplicar([{ ...vivo, status: "Não iniciado", ancora: undefined }], colunasCom(STATUS, undefined, false));
    expect(r.colunasCriadas).toEqual([{ titulo: "Âncora", id: "anc_nova" }]);
    expect(JSON.parse(chamadas[1].vars.valores as string)).toEqual({ anc_nova: "2026-11-18" });
  });
});

describe("webhook: só as ações de recorrência do item que mudou", () => {
  it("filtra pelo item; inclui a criação da coluna só se o item tiver ação", () => {
    const p = plano(
      [
        { id: "1", rec: "4. Mensal", prazo: "2026-11-18", status: "Concluído", area: OPER },
        { id: "2", rec: "4. Mensal", prazo: "2026-11-20", status: "Concluído", area: OPER },
        { id: "3", prazo: "2026-10-01", status: "Concluído" },
      ],
      grupos,
      colunasCom(STATUS, undefined, false),
    );
    expect(acoesRecorrenciaDoItem(p.acoesArea, "1").map((a) => [a.tipo, "itemId" in a ? a.itemId : null])).toEqual([
      ["coluna_criada", null],
      ["historico_criado", "1"],
      ["recorrencia_avancada", "1"],
    ]);
    expect(acoesRecorrenciaDoItem(p.acoesArea, "3")).toEqual([]); // área/finalização ficam para o coletor
  });
});

describe("migração do modelo antigo (dados de 2026-11-16)", () => {
  const OBS = "Aguardando fechamento da contabilidade";
  const regra = (id: string, nome: string, prazo: string | undefined, grupo = CTRL): It => ({ id, nome, rec: "4. Mensal", status: "Regra recorrente", prazo, grupo, area: grupo, obs: OBS });
  const oc = (id: string, regraId: string, nome: string, chaveData: string, prazo: string, status = "Não iniciado", grupo = CTRL): It => ({ id, nome, rec: "4. Mensal", chave: `${regraId}:${chaveData}`, prazo, status, grupo, area: grupo, obs: OBS });
  const ADM_ = "Coordenação Administrativa e Financeira";
  const CONTABIL = "Coordenação Contábil e Fiscal";
  const gs = [...grupos, { id: "gc", title: CONTABIL, position: "5" }];
  const hoje: It[] = [
    regra("13488815179", "Material CONFIS", "2026-11-13"),
    oc("13503184017", "13488815179", "Material CONFIS · 13/11", "2026-11-13", "2026-11-13", "Concluído"),
    oc("13503209258", "13488815179", "Material CONFIS · 13/12", "2026-12-13", "2026-12-13"),
    regra("13488818338", "Material CONSAD", "2026-11-18"),
    oc("13503211992", "13488818338", "Material CONSAD · 18/11", "2026-11-18", "2026-11-18"),
    oc("13503202632", "13488818338", "Material CONSAD · 18/12", "2026-12-18", "2026-12-18"),
    regra("13488843717", "Prévia Orçamentária WIZ", "2026-11-18"),
    oc("13543581379", "13488843717", "Prévia Orçamentária WIZ · 18/11", "2026-11-18", "2026-11-18"),
    oc("13503208889", "13488843717", "Prévia Orçamentária WIZ · 12/12", "2026-12-12", "2026-12-18"),
    oc("13543589200", "13488843717", "Prévia Orçamentária WIZ · 18/12", "2026-12-18", "2026-12-18"),
    regra("13488856283", "Material Panorama DICOL Mensal", "2026-11-09"),
    oc("13503183818", "13488856283", "Material Panorama DICOL Mensal · 09/11", "2026-11-09", "2026-11-09", "Concluído", FINAL),
    oc("13503212225", "13488856283", "Material Panorama DICOL Mensal · 09/12", "2026-12-09", "2026-12-09"),
    { id: "13488974282", nome: "Painel Mapfre", rec: "1. Não recorrente", status: "Em andamento", prazo: "2026-11-21", grupo: CTRL, area: CTRL },
    regra("13502951324", "Intercompany WIZ", "2026-11-13", ADM_),
    oc("13534484020", "13502951324", "Intercompany WIZ · 13/11", "2026-11-13", "2026-11-13", "Não iniciado", ADM_),
    oc("13534450432", "13502951324", "Intercompany WIZ · 13/12", "2026-12-13", "2026-12-13", "Não iniciado", ADM_),
    { ...regra("13502961052", "Intercompany BRB", undefined, ADM_), obs: undefined },
    regra("13503013913", "Apresentação DRE Dicol", "2026-11-10", CONTABIL),
    oc("13503209263", "13503013913", "Apresentação DRE Dicol · 10/11", "2026-11-10", "2026-11-10", "Não iniciado", CONTABIL),
    oc("13503209293", "13503013913", "Apresentação DRE Dicol · 10/12", "2026-12-10", "2026-12-10", "Não iniciado", CONTABIL),
  ];
  const p = planejarMigracao(ler(hoje, gs, colunasCom(STATUS, undefined, false)), cfg);

  it("7 itens convertidos, com o Prazo da ocorrência aberta mais antiga (BRB sem data)", () => {
    expect(Object.fromEntries(p.convertidos.map((c) => [c.nome, c.prazo]))).toEqual({
      "Material Panorama DICOL Mensal": "2026-12-09",
      "Material CONFIS": "2026-12-13",
      "Material CONSAD": "2026-11-18",
      "Prévia Orçamentária WIZ": "2026-11-18",
      "Intercompany WIZ": "2026-11-13",
      "Apresentação DRE Dicol": "2026-11-10",
      "Intercompany BRB": null,
    });
    expect(p.convertidos.every((c) => c.status === "Não iniciado" && c.ancora === c.prazo)).toBe(true);
    expect(p.convertidos.find((c) => c.nome === "Intercompany BRB")).toMatchObject({ de: null, observacao: null });
    expect(p.criarColunaAncora).toBe(true);
  });

  it("11 ocorrências abertas arquivadas (inclusive a 'atual' de cada regra); 2 concluídas ficam como histórico", () => {
    expect(p.arquivados).toHaveLength(11);
    expect(p.arquivados.map((a) => a.id)).toContain("13503208889"); // a "· 12/12" editada para 18/12
    expect(p.historico.map((h) => h.nome)).toEqual(["Material CONFIS · 13/11", "Material Panorama DICOL Mensal · 09/11"]);
    expect(p.historico.every((h) => h.chave && h.status === "Concluído")).toBe(true);
  });

  it("o item único (Não recorrente) não é tocado", () => {
    expect(p.convertidos.some((c) => c.itemId === "13488974282")).toBe(false);
    expect(p.arquivados.some((a) => a.id === "13488974282")).toBe(false);
  });
});
