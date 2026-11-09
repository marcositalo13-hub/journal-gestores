// Quadro de Atividades por área: classificação, plano, edição. Sem rede.
import { describe, expect, it } from "vitest";
import raw from "../../../config/jornal.config.json";
import { getConfig, gestorDaArea, validarConfig } from "../config";
import { montarItensJornal } from "../edicao/itens";
import { montarEdicao } from "../edicao/montar";
import { janelaPadrao } from "../recorrencia";
import { montarColumnValuesArea } from "./aplicar";
import { RotuloNaoResolvido } from "../rotulos";
import { classificarItem, detectarChavesDuplicadas, normalizarQuadro, type QuadroLido } from "./ler";
import { nomeOcorrencia, planejarQuadro, type AcaoArea } from "./planejar";

const cfg = getConfig();
const HOJE = "2026-11-05";
const JANELA = janelaPadrao(HOJE); // 2026-11-01 → 2026-12-31
const OPER = "Gerência de Operações e Suporte ao Cliente";
const ADM = "Coordenação Administrativa e Financeira";
const FINAL = "Atividades finalizadas";

const CTRL = "Coordenação de Controladoria";

// Rótulos como no quadro real (IDs de verdade, nomes com prefixo numérico).
const statusSettings = (labels: Record<string, string>) => JSON.stringify({ labels });
const dropdownSettings = (labels: [number, string][]) => JSON.stringify({ labels: labels.map(([id, name]) => ({ id, name })) });
const STATUS = { "0": "Em andamento", "1": "Concluído", "2": "Travado", "10": "Cancelado", "17": "Não iniciado", "105": "Regra recorrente" };
const REC: [number, string][] = [[1, "1. Não recorrente"], [2, "2. Diária"], [3, "Semanal"], [4, "3. Quinzenal"], [5, "4. Mensal"], [6, "5. Anual"]];
const AREAS: [number, string][] = cfg.gestores.map((g, i) => [i + 1, g.area]);
const idArea = (nome: string) => AREAS.find(([, n]) => n === nome)![0];

const colunasCom = (status: Record<string, string> = STATUS, rec: [number, string][] = REC) => [
  { id: "rec", title: "Recorrência", type: "dropdown", settings_str: dropdownSettings(rec) },
  { id: "tipo", title: "Tipo", type: "status", settings_str: statusSettings({ "0": "Atividade", "1": "Entrega", "2": "Pagamento", "19": "Contrato" }) },
  { id: "obs", title: "Observação", type: "text" },
  { id: "prazo", title: "Prazo", type: "date" },
  { id: "st", title: "Status", type: "status", settings_str: statusSettings(status) },
  { id: "ch", title: "Chave", type: "text" },
  { id: "area", title: "Área", type: "dropdown", settings_str: dropdownSettings(AREAS) },
];
const colunas = colunasCom();
const grupos = [OPER, ADM, CTRL, FINAL].map((title, i) => ({ id: `g${i}`, title, position: String(i + 1) }));

interface It {
  id: string;
  grupo?: string;
  nome?: string;
  rec?: string;
  chave?: string;
  prazo?: string;
  status?: string;
  tipo?: string;
  area?: string;
  obs?: string;
}
const api = (o: It) => {
  const grupo = o.grupo ?? OPER;
  return {
    id: o.id,
    name: o.nome ?? `Item ${o.id}`,
    url: "https://x.monday.com/1",
    updated_at: "2026-11-01T10:00:00Z",
    group: { id: grupos.find((g) => g.title === grupo)?.id ?? "gx", title: grupo },
    column_values: [
      { id: "rec", text: o.rec ?? null, values: o.rec ? [{ label: o.rec }] : [] },
      { id: "tipo", text: o.tipo ?? "Atividade", label: o.tipo ?? "Atividade" },
      { id: "obs", text: o.obs ?? null },
      { id: "prazo", text: o.prazo ?? null, date: o.prazo ?? null },
      { id: "st", text: o.status ?? null, label: o.status ?? null },
      { id: "ch", text: o.chave ?? null },
      { id: "area", text: o.area ?? null, values: o.area ? [{ label: o.area }] : [] },
    ],
    subitems: [],
  };
};
const ler = (itens: It[], gs = grupos, cols = colunas): QuadroLido =>
  normalizarQuadro(
    { id: "18438464813", tipo: "atividades", layout: "por_area", dono: "Solange Mata" },
    { id: "18438464813", name: "Atividades", hierarchy_type: "multi_level", columns: cols, groups: gs, items_page: { cursor: null, items: [] } },
    itens.map(api),
    cfg,
  );
const plano = (itens: It[]) => planejarQuadro(ler(itens), JANELA, cfg, HOJE);
const de = <T extends AcaoArea["tipo"]>(a: AcaoArea[], t: T) => a.filter((x): x is Extract<AcaoArea, { tipo: T }> => x.tipo === t);

describe("classificação", () => {
  it("Regra = recorrente sem Chave; Ocorrência = com Chave; Único = o resto", () => {
    expect(classificarItem("Semanal", null)).toBe("regra");
    expect(classificarItem("4. Mensal", "")).toBe("regra");
    expect(classificarItem("3. Quinzenal", null)).toBe("regra");
    expect(classificarItem("5. Anual", "  ")).toBe("regra");
    expect(classificarItem("4. Mensal", "123:2026-11-05")).toBe("ocorrencia");
    expect(classificarItem(null, "123:2026-11-05")).toBe("ocorrencia");
    expect(classificarItem("1. Não recorrente", null)).toBe("unico");
    expect(classificarItem(null, null)).toBe("unico");
    expect(classificarItem("2. Diária", null)).toBe("unico");
  });

  it("marca área do grupo e finalizadas; sem conceito de Cadastro", () => {
    const q = ler([{ id: "1" }, { id: "2", grupo: FINAL }]);
    expect(q.layout).toBe("por_area");
    expect(q.itens[0].porArea).toEqual({ classe: "unico", areaGrupo: OPER, finalizada: false });
    expect(q.itens[1].porArea).toEqual({ classe: "unico", areaGrupo: null, finalizada: true });
    expect(q.itens.some((i) => i.noCadastro)).toBe(false);
    expect(q.avisos.filter((a) => a.codigo === "grupo_cadastro_ausente")).toEqual([]);
  });

  it("grupo que não é área nem finalizadas → grupo_desconhecido, mesmo vazio; seus itens são ignorados", () => {
    const gs = [...grupos, { id: "gx", title: "Novembro 2026", position: "9" }];
    const q = ler([{ id: "1", grupo: "Novembro 2026", status: "Concluído", prazo: "2026-10-01" }], gs);
    expect(q.avisos.filter((a) => a.codigo === "grupo_desconhecido").map((a) => a.mensagem)).toEqual([expect.stringContaining("Novembro 2026")]);
    expect(planejarQuadro(q, JANELA, cfg, HOJE).acoesArea).toEqual([]);
    expect(montarItensJornal([q], cfg).itens).toEqual([]);
    const vazio = ler([], gs);
    expect(vazio.avisos.some((a) => a.codigo === "grupo_desconhecido")).toBe(true);
  });

  it("sem o grupo de finalizadas: avisa e não planeja finalização", () => {
    const gs = grupos.filter((g) => g.title !== FINAL);
    const q = ler([{ id: "1", status: "Concluído", prazo: "2026-10-01", area: OPER }], gs);
    expect(q.avisos.some((a) => a.codigo === "grupo_finalizadas_ausente")).toBe(true);
    expect(planejarQuadro(q, JANELA, cfg, HOJE).acoesArea).toEqual([]);
  });

  it("chave duplicada vale para o quadro inteiro em por_area; por_mes continua só nos meses", () => {
    const q = ler([
      { id: "1", chave: "9:2026-11-05", area: OPER },
      { id: "2", chave: "9:2026-11-05", grupo: FINAL, area: OPER },
    ]);
    expect(q.avisos.filter((a) => a.codigo === "chave_duplicada")).toHaveLength(1);
    const it_ = (id: string, grupo: string) => ({ id, chave: "x", grupo: { id: "g", titulo: grupo } });
    expect(detectarChavesDuplicadas([it_("1", "A"), it_("2", "B")], cfg, "por_mes")).toEqual([]);
    expect(detectarChavesDuplicadas([it_("1", "A"), it_("2", "B")], cfg, "por_area")).toHaveLength(1);
  });
});

describe("area_atualizada", () => {
  it("Área vazia ou diferente da do grupo → atualiza; igual → nada", () => {
    const p = plano([{ id: "1" }, { id: "2", area: ADM }, { id: "3", area: OPER }]);
    expect(de(p.acoesArea, "area_atualizada").map((a) => [a.itemId, a.areaAtual, a.area])).toEqual([
      ["1", null, OPER],
      ["2", ADM, OPER],
    ]);
  });
  it("nunca toca na Área de itens em finalizadas", () => {
    expect(de(plano([{ id: "1", grupo: FINAL }, { id: "2", grupo: FINAL, area: ADM }]).acoesArea, "area_atualizada")).toEqual([]);
  });
  it("regras também recebem Área", () => {
    expect(de(plano([{ id: "1", rec: "Semanal", prazo: "2026-11-06" }]).acoesArea, "area_atualizada").map((a) => a.itemId)).toEqual(["1"]);
  });
});

describe("regra_rotulada", () => {
  it("regra com Status diferente → rotula; já rotulada → nada; não-regra → nada", () => {
    const p = plano([
      { id: "1", rec: "Semanal", prazo: "2026-11-06", area: OPER },
      { id: "2", rec: "4. Mensal", prazo: "2026-11-05", status: "Regra recorrente", area: OPER },
      { id: "3", rec: "Semanal", chave: "9:2026-11-06", area: OPER },
      { id: "4", rec: "1. Não recorrente", area: OPER },
    ]);
    expect(de(p.acoesArea, "regra_rotulada").map((a) => [a.itemId, a.statusAtual, a.status])).toEqual([["1", null, "Regra recorrente"]]);
  });
});

describe("seria_criada", () => {
  it("nome '· dd/mm'", () => expect(nomeOcorrencia("[TESTE] Conciliação bancária", "2026-11-06")).toBe("[TESTE] Conciliação bancária · 06/11"));

  it("projeta na janela, no grupo da própria regra, com chave regraId:data", () => {
    const p = plano([{ id: "77", nome: "Relatório", rec: "4. Mensal", prazo: "2026-11-05", status: "Regra recorrente", area: OPER, tipo: "Entrega" }]);
    const c = de(p.acoesArea, "seria_criada");
    expect(c.map((a) => [a.itemNome, a.ocorrencia.chave, a.grupo.titulo, a.area])).toEqual([
      ["Relatório · 05/11", "77:2026-11-05", OPER, OPER],
      ["Relatório · 05/12", "77:2026-12-05", OPER, OPER],
    ]);
  });

  it("semanal a partir de 06/11: 8 ocorrências até 25/12 (feriado mantido na data)", () => {
    const c = de(plano([{ id: "5", nome: "Conciliação", rec: "Semanal", prazo: "2026-11-06", grupo: ADM, area: ADM }]).acoesArea, "seria_criada");
    expect(c).toHaveLength(8);
    expect(c[0].itemNome).toBe("Conciliação · 06/11");
    expect(c.at(-1)?.itemNome).toBe("Conciliação · 25/12");
    expect(c.at(-1)?.ocorrencia.dataOriginal).toBe("2026-12-25");
    expect(c.every((a) => a.grupo.titulo === ADM)).toBe(true);
  });

  it("existência olha TODOS os grupos, inclusive finalizadas (ocorrência finalizada não renasce)", () => {
    const p = plano([
      { id: "77", rec: "4. Mensal", prazo: "2026-11-05", status: "Regra recorrente", area: OPER },
      { id: "a", chave: "77:2026-11-05", grupo: FINAL, status: "Concluído", area: OPER },
      { id: "b", chave: "77:2026-12-05", grupo: ADM, area: ADM },
    ]);
    expect(de(p.acoesArea, "seria_criada")).toEqual([]);
    expect(p.ocorrenciasExistentes).toBe(2);
  });

  it("regras em finalizadas são recorrências encerradas: nunca projetadas nem rotuladas", () => {
    const p = plano([{ id: "1", rec: "Semanal", prazo: "2026-11-06", grupo: FINAL, status: "Concluído" }]);
    expect(p.acoesArea).toEqual([]);
  });

  it("regra sem Prazo não projeta (mas é rotulada); nunca há grupos de mês no plano", () => {
    const p = plano([{ id: "1", rec: "Semanal", area: OPER }]);
    expect(de(p.acoesArea, "seria_criada")).toEqual([]);
    expect(de(p.acoesArea, "regra_rotulada")).toHaveLength(1);
    expect(p.acoes).toEqual([]);
  });

  it("column_values (por ID): copia Tipo, Recorrência e Observação; Status inicial, Prazo = data original, Chave e Área", () => {
    const q = ler([{ id: "77", rec: "4. Mensal", prazo: "2026-11-05", tipo: "Entrega", status: "Regra recorrente", obs: "nota da regra" }]);
    const oc = { chave: "77:2026-11-14", dataOriginal: "2026-11-14", dataEfetiva: "2026-11-14", grupoMes: "x", avisarEm: "2026-11-13" };
    expect(montarColumnValuesArea(q.itens[0], oc, OPER, "atividades", q.colunas, cfg)).toEqual({
      tipo: { index: 1 },
      rec: { ids: [5] },
      obs: "nota da regra",
      st: { index: 17 },
      prazo: { date: "2026-11-14" },
      ch: "77:2026-11-14",
      area: { ids: [idArea(OPER)] },
    });
  });
});

describe("seria_finalizado", () => {
  const fin = (o: Partial<It>) => de(plano([{ id: "1", area: OPER, ...o }]).acoesArea, "seria_finalizado");

  it("limite: exatamente 7 dias move; 6 dias fica", () => {
    expect(fin({ status: "Concluído", prazo: "2026-10-29" }).map((a) => a.grupo.titulo)).toEqual([FINAL]);
    expect(fin({ status: "Concluído", prazo: "2026-10-30" })).toEqual([]);
  });
  it("Concluído e Cancelado movem; aberto e travado não", () => {
    expect(fin({ status: "Cancelado", prazo: "2026-10-01" })).toHaveLength(1);
    for (const status of ["Em andamento", "Não iniciado", "Travado"]) expect(fin({ status, prazo: "2026-10-01" })).toEqual([]);
    expect(fin({ prazo: "2026-10-01" })).toEqual([]);
  });
  it("sem Prazo não move; Ocorrência move; Regra nunca; já em finalizadas não move de novo", () => {
    expect(fin({ status: "Concluído" })).toEqual([]);
    expect(fin({ status: "Concluído", prazo: "2026-10-01", chave: "9:2026-10-01" })).toHaveLength(1);
    expect(fin({ status: "Concluído", prazo: "2026-10-01", rec: "Semanal" })).toEqual([]);
    expect(fin({ status: "Concluído", prazo: "2026-10-01", grupo: FINAL })).toEqual([]);
  });
  it("a Área é gravada antes de mover (ordem do plano)", () => {
    const tipos = plano([{ id: "1", status: "Concluído", prazo: "2026-10-20" }]).acoesArea.map((a) => a.tipo);
    expect(tipos).toEqual(["area_atualizada", "seria_finalizado"]);
  });
});

describe("avisos do plano", () => {
  it("Diária: aviso próprio, vira único (não projeta, não é rotulada)", () => {
    const p = plano([{ id: "1", rec: "2. Diária", prazo: "2026-11-06", area: OPER }]);
    expect(p.avisos.map((a) => a.codigo)).toEqual(["recorrencia_diaria_nao_suportada"]);
    expect(p.acoesArea).toEqual([]);
    expect(montarItensJornal([ler([{ id: "1", rec: "2. Diária", prazo: "2026-11-06", area: OPER }])], cfg).itens).toHaveLength(1); // continua na edição
  });
  it("rótulo desconhecido mantém recorrencia_desconhecida", () => {
    const p = plano([{ id: "1", rec: "Bimestral", prazo: "2026-11-06", area: OPER }]);
    expect(p.avisos.map((a) => a.codigo)).toEqual(["recorrencia_desconhecida"]);
  });
});

describe("idempotência", () => {
  it("depois de aplicar o plano, um novo plano não tem nada a fazer", () => {
    const antes: It[] = [
      { id: "77", nome: "Relatório", rec: "4. Mensal", prazo: "2026-11-05", status: "Regra recorrente" },
      { id: "5", nome: "Treino", prazo: "2026-10-20", status: "Concluído" },
    ];
    const p = plano(antes);
    const depois: It[] = [
      { ...antes[0], area: OPER },
      { ...antes[1], area: OPER, grupo: FINAL },
      ...de(p.acoesArea, "seria_criada").map((a, i) => ({ id: `n${i}`, nome: a.itemNome, chave: a.ocorrencia.chave, prazo: a.ocorrencia.dataOriginal, status: "Não iniciado", rec: "4. Mensal", area: a.area, grupo: a.grupo.titulo })),
    ];
    const novo = plano(depois);
    expect(novo.acoesArea).toEqual([]);
    expect(novo.ocorrenciasExistentes).toBe(2);
  });
});

describe("edição", () => {
  const edicao = (itens: It[]) => montarItensJornal([ler(itens)], cfg);

  it("entram ocorrências e únicos de áreas e finalizadas; regras nunca", () => {
    const { itens } = edicao([
      { id: "r", rec: "Semanal", prazo: "2026-11-06", status: "Regra recorrente", area: OPER },
      { id: "rf", rec: "Semanal", prazo: "2026-11-06", grupo: FINAL, area: OPER },
      { id: "o", chave: "r:2026-11-06", prazo: "2026-11-06", area: OPER },
      { id: "u", prazo: "2026-11-07", area: OPER },
      { id: "f", prazo: "2026-10-01", grupo: FINAL, status: "Concluído", area: ADM },
    ]);
    expect(itens.map((i) => i.id)).toEqual(["o", "u", "f"]);
  });

  it("dono: coluna Área; vazia → área do grupo; nenhuma → 'Sem área' com aviso", () => {
    const q = ler([
      { id: "1", prazo: "2026-11-06", area: ADM },
      { id: "2", prazo: "2026-11-06" },
      { id: "3", prazo: "2026-10-01", grupo: FINAL, status: "Concluído" },
      { id: "4", prazo: "2026-10-01", grupo: FINAL, status: "Concluído", area: OPER },
    ]);
    expect(montarItensJornal([q], cfg).itens.map((i) => i.dono)).toEqual(["Keite Martins", "Lucas Martins", "Sem área", "Lucas Martins"]);
    expect(q.avisos.filter((a) => a.codigo === "item_sem_area").map((a) => a.itemId)).toEqual(["3"]);
  });

  it("item sem data não some: vai para semPrazo com o gestor da área", () => {
    const { itens, semPrazo } = edicao([{ id: "1", nome: "teste", grupo: ADM }]);
    expect(itens).toEqual([]);
    expect(semPrazo.map((i) => [i.nome, i.dono])).toEqual([["teste", "Keite Martins"]]);
  });

  it("travado usa Observação como motivo; regra de Status 'Regra recorrente' não vaza; Contrato segue valendo para a manchete", () => {
    const { itens, semPrazo } = edicao([
      { id: "1", tipo: "Contrato", prazo: "2026-11-10", status: "Travado", obs: "Aguardando parecer", area: OPER },
      { id: "2", rec: "Semanal", prazo: "2026-11-06", status: "Regra recorrente", area: OPER },
    ]);
    const e = montarEdicao(itens, HOJE, cfg, "x", semPrazo);
    expect(e.travados.map((t) => [t.item.dono, t.motivo])).toEqual([["Lucas Martins", "Aguardando parecer"]]);
    expect(e.manchete).toMatchObject({ regra: "contrato", item: { id: "1" } });
  });
});

describe("Pagamentos (por_mes) não muda", () => {
  const colsPag = [
    { id: "venc", title: "Vencimento", type: "date" },
    { id: "val", title: "Valor (R$)", type: "numbers" },
    { id: "rec", title: "Recorrência", type: "dropdown" },
    { id: "st", title: "Status", type: "status" },
    { id: "ch", title: "Chave", type: "text" },
  ];
  const item = (id: string, grupo: string, venc: string, chave: string | null) => ({
    id,
    name: `Pag ${id}`,
    url: "https://x",
    updated_at: "x",
    group: { id: grupo, title: grupo },
    column_values: [
      { id: "venc", text: venc, date: venc },
      { id: "val", text: "100", number: 100 },
      { id: "rec", text: "Mensal", values: [{ label: "Mensal" }] },
      { id: "st", text: "Previsto", label: "Previsto" },
      { id: "ch", text: chave },
    ],
    subitems: [],
  });
  const q = normalizarQuadro(
    { id: "18434047675", tipo: "pagamentos", layout: "por_mes", dono: "Solange Mata" },
    {
      id: "18434047675",
      name: "Pagamentos",
      hierarchy_type: "multi_level",
      columns: colsPag,
      groups: [
        { id: "Cadastro", title: "Cadastro", position: "1" },
        { id: "Novembro 2026", title: "Novembro 2026", position: "2" },
      ],
      items_page: { cursor: null, items: [] },
    },
    [item("1", "Cadastro", "2026-11-10", null), item("2", "Novembro 2026", "2026-11-10", "1:2026-11-10")],
    cfg,
  );

  it("mesma leitura e mesmo plano de antes; nenhuma ação por_area", () => {
    expect(q.itens.every((i) => i.porArea === undefined)).toBe(true);
    expect(q.itens[0].noCadastro).toBe(true);
    const p = planejarQuadro(q, JANELA, cfg, HOJE);
    expect(p.acoesArea).toEqual([]);
    expect(p.acoes.map((a) => [a.tipo, a.itemNome, a.ocorrencia.chave, a.grupoExiste])).toEqual([
      ["existe", "Pag 1", "1:2026-11-10", true],
      ["seria_criada", "Pag 1", "1:2026-12-10", false],
    ]);
  });
  it("na edição a ocorrência entra e a regra do Cadastro não", () => {
    expect(montarItensJornal([q], cfg).itens.map((i) => i.id)).toEqual(["2"]);
  });
});

describe("config", () => {
  it("layouts e quadro aposentado", () => {
    expect(cfg.quadros.map((q) => [q.id, q.layout])).toEqual([
      ["18434047675", "por_mes"],
      ["18438464813", "por_area"],
    ]);
    expect(cfg.quadros_ignorados).toContain("18434048054");
    expect(cfg.tipos_de_quadro.atividades.campo_motivo).toBe("Observação");
    expect(Object.keys(cfg.tipos_de_quadro.atividades.colunas)).not.toContain("Responsável");
    expect(gestorDaArea(OPER, cfg)).toBe("Lucas Martins");
    expect(gestorDaArea(FINAL, cfg)).toBeNull();
  });
  it("rejeita layout inválido, finalizar_apos_dias inválido, por_area sem status_regra, finalizadas igual a uma área", () => {
    const q = (o: object) => ({ ...raw, quadros: [{ ...raw.quadros[0], ...o }, raw.quadros[1]] });
    expect(() => validarConfig(q({ layout: "outro" }))).toThrow(/layout/);
    expect(() => validarConfig({ ...raw, finalizar_apos_dias: -1 })).toThrow(/finalizar_apos_dias/);
    expect(() => validarConfig({ ...raw, grupo_finalizadas: "" })).toThrow(/grupo_finalizadas/);
    expect(() => validarConfig({ ...raw, grupo_finalizadas: OPER })).toThrow(/grupo_finalizadas/);
    const { status_regra: _r, ...semRegra } = raw.tipos_de_quadro.atividades;
    void _r;
    expect(() => validarConfig({ ...raw, tipos_de_quadro: { ...raw.tipos_de_quadro, atividades: semRegra } })).toThrow(/status_regra/);
  });
});

describe("rótulos renomeados: gravação por ID", () => {
  // Os usuários renomearam: "Não iniciado" → "0. Não iniciado", "Regra recorrente" → "6 - Regra Recorrente".
  const renomeado = { ...STATUS, "17": "0. Não iniciado", "105": "6 - Regra Recorrente" };
  const itemRegra: It = { id: "77", nome: "Relatório", rec: "4. Mensal", prazo: "2026-11-05", status: "6 - Regra Recorrente", area: OPER, obs: "Aguardando" };

  it("resolve o ID pelo nome normalizado, mesmo renomeado", () => {
    const q = ler([itemRegra], grupos, colunasCom(renomeado));
    expect(q.avisos.filter((a) => a.codigo === "rotulo_nao_encontrado")).toEqual([]);
    const oc = { chave: "77:2026-11-05", dataOriginal: "2026-11-05", dataEfetiva: "2026-11-05", grupoMes: "x" };
    expect(montarColumnValuesArea(q.itens[0], oc, OPER, "atividades", q.colunas, cfg)).toMatchObject({ st: { index: 17 }, rec: { ids: [5] } });
  });

  it("regra já com o rótulo renomeado não é rotulada de novo (sem churn)", () => {
    const p = planejarQuadro(ler([itemRegra], grupos, colunasCom(renomeado)), JANELA, cfg, HOJE);
    expect(de(p.acoesArea, "regra_rotulada")).toEqual([]);
  });

  it("o texto do rótulo nunca é enviado: só IDs", () => {
    const q = ler([itemRegra], grupos, colunasCom(renomeado));
    const oc = { chave: "77:2026-11-05", dataOriginal: "2026-11-05", dataEfetiva: "2026-11-05", grupoMes: "x" };
    const valores = montarColumnValuesArea(q.itens[0], oc, OPER, "atividades", q.colunas, cfg);
    expect(JSON.stringify(valores)).not.toMatch(/Não iniciado|Mensal|Gerência/);
  });

  it("rótulo configurado que não existe mais: aviso no coletor + gravação lança (é pulada e vira falha)", () => {
    const sem = { ...STATUS };
    delete (sem as Record<string, string>)["17"]; // "Não iniciado" sumiu
    const q = ler([itemRegra], grupos, colunasCom(sem));
    expect(q.avisos.filter((a) => a.codigo === "rotulo_nao_encontrado").map((a) => a.mensagem)).toEqual([expect.stringContaining("Não iniciado")]);
    const oc = { chave: "77:2026-11-05", dataOriginal: "2026-11-05", dataEfetiva: "2026-11-05", grupoMes: "x" };
    expect(() => montarColumnValuesArea(q.itens[0], oc, OPER, "atividades", q.colunas, cfg)).toThrow(RotuloNaoResolvido);
  });

  it("área do config sem rótulo na coluna Área também é avisada", () => {
    const cols = colunasCom().map((c) => (c.id === "area" ? { ...c, settings_str: dropdownSettings(AREAS.slice(1)) } : c));
    const q = ler([], grupos, cols);
    expect(q.avisos.filter((a) => a.codigo === "rotulo_nao_encontrado").map((a) => a.mensagem)).toEqual([expect.stringContaining(cfg.gestores[0].area)]);
  });
});

describe("Observação da regra acompanha as ocorrências", () => {
  const oc = { chave: "9:2026-11-12", dataOriginal: "2026-11-12", dataEfetiva: "2026-11-12", grupoMes: "x" };
  it("copiada quando preenchida; omitida quando vazia", () => {
    const q = ler([{ id: "9", rec: "4. Mensal", prazo: "2026-11-12", area: CTRL, obs: "Aguardando fechamento da contabilidade" }, { id: "10", rec: "4. Mensal", prazo: "2026-11-12", area: CTRL }]);
    expect(montarColumnValuesArea(q.itens[0], oc, CTRL, "atividades", q.colunas, cfg).obs).toBe("Aguardando fechamento da contabilidade");
    expect(montarColumnValuesArea(q.itens[1], oc, CTRL, "atividades", q.colunas, cfg)).not.toHaveProperty("obs");
  });
});

describe("caso real: 4 regras mensais da Controladoria ('4. Mensal')", () => {
  const regras: It[] = [
    { id: "1", nome: "Material Panorama DICOL Mensal", prazo: "2026-11-09" },
    { id: "2", nome: "Prévia Orçamentária WIZ", prazo: "2026-11-12" },
    { id: "3", nome: "Material CONFIS", prazo: "2026-11-13" },
    { id: "4", nome: "Material CONSAD", prazo: "2026-11-18" },
  ].map((r) => ({ ...r, rec: "4. Mensal", status: "Não iniciado", grupo: CTRL, area: CTRL, obs: "Aguardando fechamento da contabilidade" }));

  it("viram regras (rotuladas) e geram as ocorrências de novembro e dezembro", () => {
    const q = ler(regras);
    expect(q.itens.every((i) => i.porArea?.classe === "regra")).toBe(true);
    const p = planejarQuadro(q, janelaPadrao("2026-11-09"), cfg, "2026-11-09");
    expect(de(p.acoesArea, "regra_rotulada")).toHaveLength(4);
    const criadas = de(p.acoesArea, "seria_criada");
    expect(criadas.map((a) => a.itemNome)).toEqual([
      "Material Panorama DICOL Mensal · 09/11", "Material Panorama DICOL Mensal · 09/12",
      "Prévia Orçamentária WIZ · 12/11", "Prévia Orçamentária WIZ · 12/12",
      "Material CONFIS · 13/11", "Material CONFIS · 13/12",
      "Material CONSAD · 18/11", "Material CONSAD · 18/12",
    ]);
    expect(criadas.every((a) => a.grupo.titulo === CTRL)).toBe(true);
    const valores = montarColumnValuesArea(q.itens[0], criadas[0].ocorrencia, CTRL, "atividades", q.colunas, cfg);
    expect(valores).toMatchObject({ obs: "Aguardando fechamento da contabilidade", rec: { ids: [5] }, st: { index: 17 }, area: { ids: [idArea(CTRL)] } });
  });
});
