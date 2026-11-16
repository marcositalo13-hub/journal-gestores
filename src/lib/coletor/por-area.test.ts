// Quadro de Atividades por área: classificação, plano, edição. Sem rede. (Recorrência viva: veja recorrencia-viva.test.ts.)
import { describe, expect, it } from "vitest";
import raw from "../../../config/jornal.config.json";
import { gestorDaArea, validarConfig } from "../config";
import { montarItensJornal } from "../edicao/itens";
import { montarEdicao } from "../edicao/montar";
import { janelaPadrao } from "../recorrencia";
import { valoresAvanco, valoresHistorico } from "./aplicar";
import { RotuloNaoResolvido } from "../rotulos";
import { classificarItem, detectarChavesDuplicadas, normalizarQuadro } from "./ler";
import { cfgPorMes } from "./config-por-mes";
import { ADM, AREAS, CTRL, FINAL, OPER, STATUS, cfg, colunasCom, de, dropdownSettings, grupos, idArea, ler, planoEm, type It } from "./fixture-atividades";
import { nomeOcorrencia, planejarQuadro } from "./planejar";

const HOJE = "2026-11-05";
const JANELA = janelaPadrao(HOJE); // 2026-11-01 → 2026-12-31
const plano = planoEm(HOJE);

describe("status vazio: o item segue visível como aberto e o coletor avisa", () => {
  const q = () => ler([{ id: "1", nome: "Assinatura Distrato Anexo 3", tipo: "Distrato", prazo: "2026-11-04", grupo: OPER, status: undefined }]);

  it("aviso 'status_vazio' com o item e a área", () => {
    const av = q().avisos.filter((a) => a.codigo === "status_vazio");
    expect(av).toHaveLength(1);
    expect(av[0]).toMatchObject({ itemId: "1", itemNome: "Assinatura Distrato Anexo 3" });
    expect(av[0].mensagem).toContain(OPER);
  });
  it("conta como 'aberto' na edição (aparece, atrasado) e Distrato é tipo de assinatura", () => {
    const { itens } = montarItensJornal([q()], cfg);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ tipo: "Distrato", categoria: "aberto", status: null });
    const e = montarEdicao(itens, HOJE, cfg, "x");
    expect(e.pendencias.map((p) => p.item.nome)).toEqual(["Assinatura Distrato Anexo 3"]);
  });
  it("sem aviso quando há Status; a atividade recorrente viva sem Status também é avisada (é um item como os outros)", () => {
    const comStatus = ler([{ id: "2", prazo: "2026-11-06", status: "Em andamento" }]);
    expect(comStatus.avisos.some((a) => a.codigo === "status_vazio")).toBe(false);
    const recorrente = ler([{ id: "3", rec: "4. Mensal", prazo: "2026-11-06", status: undefined }]);
    expect(recorrente.avisos.filter((a) => a.codigo === "status_vazio").map((a) => a.itemId)).toEqual(["3"]);
  });
});

describe("classificação", () => {
  it("Recorrente vivo ('regra') = recorrente sem Chave; com Chave = histórico/ocorrência; Único = o resto", () => {
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
  it("itens recorrentes também recebem Área", () => {
    expect(de(plano([{ id: "1", rec: "Semanal", prazo: "2026-11-06", ancora: "2026-11-06" }]).acoesArea, "area_atualizada").map((a) => a.itemId)).toEqual(["1"]);
  });
});

describe("o modelo antigo acabou: nada de cópias futuras nem rótulo 'Regra recorrente'", () => {
  it("um item recorrente aberto, com Área e âncora em dia, não gera nenhuma ação (nem ocorrência, nem rótulo)", () => {
    const p = plano([{ id: "77", nome: "Relatório", rec: "4. Mensal", prazo: "2026-11-05", status: "Não iniciado", area: OPER, ancora: "2026-11-05" }]);
    expect(p.acoesArea).toEqual([]);
    expect(p.acoes).toEqual([]);
    expect(p.ocorrenciasExistentes).toBe(0);
  });
  it("item ainda com Status 'Regra recorrente' não é re-rotulado: é só um item aberto", () => {
    const p = plano([{ id: "77", rec: "4. Mensal", prazo: "2026-11-05", status: "Regra recorrente", area: OPER, ancora: "2026-11-05" }]);
    expect(p.acoesArea).toEqual([]);
  });
  it("nome da cópia de histórico: '{nome} · dd/mm'", () => expect(nomeOcorrencia("[TESTE] Conciliação bancária", "2026-11-06")).toBe("[TESTE] Conciliação bancária · 06/11"));
  it("recorrentes em finalizadas são recorrências encerradas: ignorados", () => {
    expect(plano([{ id: "1", rec: "Semanal", prazo: "2026-11-06", grupo: FINAL, status: "Concluído" }]).acoesArea).toEqual([]);
  });
  it("sem a coluna Âncora no quadro: o plano começa criando a coluna", () => {
    const p = plano([{ id: "1", rec: "Semanal", prazo: "2026-11-06", area: OPER }], grupos, colunasCom(STATUS, undefined, false));
    expect(p.acoesArea.map((a) => a.tipo)).toEqual(["coluna_criada", "ancora_atualizada"]);
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
  it("sem Prazo não move; histórico (com Chave) move; o item recorrente vivo nunca é movido (avança); já em finalizadas não move de novo", () => {
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
  it("Diária: aviso próprio, vira único", () => {
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

describe("edição", () => {
  const edicao = (itens: It[]) => montarItensJornal([ler(itens)], cfg);

  it("o item recorrente vivo entra como um item comum; histórico em finalizadas também; recorrente em finalizadas também (é histórico)", () => {
    const { itens } = edicao([
      { id: "r", rec: "Semanal", prazo: "2026-11-06", status: "Não iniciado", area: OPER },
      { id: "o", chave: "r:2026-10-30", prazo: "2026-10-30", grupo: FINAL, status: "Concluído", area: OPER },
      { id: "u", prazo: "2026-11-07", area: OPER },
    ]);
    expect(itens.map((i) => i.id)).toEqual(["r", "o", "u"]);
    expect(itens.find((i) => i.id === "r")).toMatchObject({ categoria: "aberto", recorrencia: "Semanal", dono: "Lucas Martins" });
  });

  it("histórico em 'Atividades finalizadas' conta em 'confirmado no mês' do gestor", () => {
    const { itens, semPrazo } = edicao([
      { id: "h", nome: "Relatório · 03/11", chave: "r:2026-11-03", prazo: "2026-11-03", grupo: FINAL, status: "Concluído", area: OPER, rec: "4. Mensal" },
      { id: "r", nome: "Relatório", rec: "4. Mensal", prazo: "2026-12-03", status: "Não iniciado", area: OPER },
    ]);
    const e = montarEdicao(itens, HOJE, cfg, "x", semPrazo);
    expect(e.gestores.find((g) => g.nome === "Lucas Martins")?.mes).toEqual({ concluidos: 1, total: 1 });
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

  it("travado usa Observação como motivo; Contrato segue valendo para a manchete", () => {
    const { itens, semPrazo } = edicao([
      { id: "1", tipo: "Contrato", prazo: "2026-11-10", status: "Travado", obs: "Aguardando parecer", area: OPER },
      { id: "2", rec: "Semanal", prazo: "2026-11-12", status: "Não iniciado", area: OPER },
    ]);
    const e = montarEdicao(itens, HOJE, cfg, "x", semPrazo);
    expect(e.travados.map((t) => [t.item.dono, t.motivo])).toEqual([["Lucas Martins", "Aguardando parecer"]]);
    expect(e.manchete).toMatchObject({ regra: "travado", kicker: "Travado", item: { id: "1" } });
  });
});

describe("layout por_mes (genérico) não muda", () => {
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
    cfgPorMes,
  );

  it("mesma leitura e mesmo plano de antes; nenhuma ação por_area", () => {
    expect(q.itens.every((i) => i.porArea === undefined)).toBe(true);
    expect(q.itens[0].noCadastro).toBe(true);
    const p = planejarQuadro(q, JANELA, cfgPorMes, HOJE);
    expect(p.acoesArea).toEqual([]);
    expect(p.acoes.map((a) => [a.tipo, a.itemNome, a.ocorrencia.chave, a.grupoExiste])).toEqual([
      ["existe", "Pag 1", "1:2026-11-10", true],
      ["seria_criada", "Pag 1", "1:2026-12-10", false],
    ]);
  });
  it("na edição a ocorrência entra e a regra do Cadastro não", () => {
    expect(montarItensJornal([q], cfgPorMes).itens.map((i) => i.id)).toEqual(["2"]);
  });
});

describe("config", () => {
  it("layouts e quadro aposentado; status_regra saiu; Âncora entrou nas colunas", () => {
    expect(cfg.quadros.map((q) => [q.id, q.layout])).toEqual([
      ["18434047675", "lista"],
      ["18438464813", "por_area"],
    ]);
    expect(cfg.quadros_ignorados).toContain("18434048054");
    expect(cfg.tipos_de_quadro.atividades.campo_motivo).toBe("Observação");
    expect(Object.keys(cfg.tipos_de_quadro.atividades.colunas)).not.toContain("Responsável");
    expect(cfg.tipos_de_quadro.atividades.colunas["Âncora"]).toBe("text");
    expect("status_regra" in cfg.tipos_de_quadro.atividades).toBe(false);
    expect(gestorDaArea(OPER, cfg)).toBe("Lucas Martins");
    expect(gestorDaArea(FINAL, cfg)).toBeNull();
  });
  it("rejeita layout inválido, finalizar_apos_dias inválido, por_area sem Âncora, finalizadas igual a uma área", () => {
    const q = (o: object) => ({ ...raw, quadros: [{ ...raw.quadros[0], ...o }, raw.quadros[1]] });
    expect(() => validarConfig(q({ layout: "outro" }))).toThrow(/layout/);
    expect(() => validarConfig({ ...raw, finalizar_apos_dias: -1 })).toThrow(/finalizar_apos_dias/);
    expect(() => validarConfig({ ...raw, grupo_finalizadas: "" })).toThrow(/grupo_finalizadas/);
    expect(() => validarConfig({ ...raw, grupo_finalizadas: OPER })).toThrow(/grupo_finalizadas/);
    const { "Âncora": _a, ...semAncora } = raw.tipos_de_quadro.atividades.colunas;
    void _a;
    const atividades = { ...raw.tipos_de_quadro.atividades, colunas: semAncora };
    expect(() => validarConfig({ ...raw, tipos_de_quadro: { ...raw.tipos_de_quadro, atividades } })).toThrow(/Âncora/);
  });
});

describe("rótulos renomeados: gravação por ID", () => {
  // Os usuários renomearam: "Não iniciado" → "0. Não iniciado".
  const renomeado = { ...STATUS, "17": "0. Não iniciado" };
  const vivo: It = { id: "77", nome: "Relatório", rec: "4. Mensal", prazo: "2026-11-05", status: "Concluído", area: OPER, obs: "Aguardando", ancora: "2026-11-05" };

  it("o avanço resolve o Status inicial pelo nome normalizado, mesmo renomeado; o texto do rótulo nunca é enviado", () => {
    const q = ler([vivo], grupos, colunasCom(renomeado));
    expect(q.avisos.filter((a) => a.codigo === "rotulo_nao_encontrado")).toEqual([]);
    const av = de(planejarQuadro(q, JANELA, cfg, HOJE).acoesArea, "recorrencia_avancada")[0];
    const valores = valoresAvanco(av, "atividades", q.colunas, cfg);
    expect(valores).toEqual({ prazo: { date: "2026-12-05" }, st: { index: 17 }, anc: "2026-11-05" });
    expect(JSON.stringify(valores)).not.toMatch(/Não iniciado/);
  });

  it("rótulo configurado que não existe mais: aviso no coletor + gravação lança (é pulada e vira falha)", () => {
    const sem = { ...STATUS };
    delete (sem as Record<string, string>)["17"]; // "Não iniciado" sumiu
    const q = ler([vivo], grupos, colunasCom(sem));
    expect(q.avisos.filter((a) => a.codigo === "rotulo_nao_encontrado").map((a) => a.mensagem)).toEqual([expect.stringContaining("Não iniciado")]);
    const av = de(planejarQuadro(q, JANELA, cfg, HOJE).acoesArea, "recorrencia_avancada")[0];
    expect(() => valoresAvanco(av, "atividades", q.colunas, cfg)).toThrow(RotuloNaoResolvido);
  });

  it("área do config sem rótulo na coluna Área também é avisada", () => {
    const cols = colunasCom().map((c) => (c.id === "area" ? { ...c, settings_str: dropdownSettings(AREAS.slice(1)) } : c));
    const q = ler([], grupos, cols);
    expect(q.avisos.filter((a) => a.codigo === "rotulo_nao_encontrado").map((a) => a.mensagem)).toEqual([expect.stringContaining(cfg.gestores[0].area)]);
  });
});

describe("cópia de histórico: colunas (por ID)", () => {
  it("copia Tipo, Área, Observação e Recorrência; Status de encerramento, Prazo encerrado e Chave", () => {
    const q = ler([{ id: "9", nome: "Material CONFIS", rec: "4. Mensal", prazo: "2026-11-13", status: "Concluído", tipo: "Entrega", area: CTRL, grupo: CTRL, obs: "Aguardando fechamento da contabilidade", ancora: "2026-11-13" }]);
    const h = de(planejarQuadro(q, JANELA, cfg, HOJE).acoesArea, "historico_criado")[0];
    expect(h).toMatchObject({ nome: "Material CONFIS · 13/11", chave: "9:2026-11-13", grupo: { titulo: FINAL } });
    expect(valoresHistorico(q.itens[0], h, "atividades", q.colunas, cfg)).toEqual({
      tipo: { index: 1 },
      area: { ids: [idArea(CTRL)] },
      obs: "Aguardando fechamento da contabilidade",
      rec: { ids: [5] },
      st: { index: 1 },
      prazo: { date: "2026-11-13" },
      ch: "9:2026-11-13",
    });
  });
  it("Observação vazia é omitida; sem a coluna Chave a cópia não é feita (lança)", () => {
    const q = ler([{ id: "9", rec: "4. Mensal", prazo: "2026-11-13", status: "Cancelado", area: CTRL, grupo: CTRL, ancora: "2026-11-13" }]);
    const h = de(planejarQuadro(q, JANELA, cfg, HOJE).acoesArea, "historico_criado")[0];
    expect(valoresHistorico(q.itens[0], h, "atividades", q.colunas, cfg)).not.toHaveProperty("obs");
    expect(valoresHistorico(q.itens[0], h, "atividades", q.colunas, cfg).st).toEqual({ index: 10 });
    expect(() => valoresHistorico(q.itens[0], h, "atividades", { ...q.colunas, Chave: null }, cfg)).toThrow(/Chave/);
  });
});

describe("recorrente sem Prazo (regra_sem_data)", () => {
  const semData: It[] = [
    { id: "r1", nome: "Intercompany WIZ", rec: "4. Mensal", status: "Não iniciado", area: OPER },
    { id: "r2", nome: "Intercompany BRB", rec: "4. Mensal", status: "Não iniciado", grupo: CTRL, area: CTRL },
  ];

  it("o coletor avisa por item, com nome e área, e não faz nada com a recorrência (mesmo concluído)", () => {
    const q = ler([...semData, { id: "r3", nome: "Concluído sem data", rec: "4. Mensal", status: "Concluído", area: OPER }]);
    const avisos = q.avisos.filter((a) => a.codigo === "regra_sem_data");
    expect(avisos.map((a) => a.itemNome)).toEqual(["Intercompany WIZ", "Intercompany BRB"]);
    expect(avisos[0].mensagem).toContain(OPER);
    expect(avisos[0].mensagem).toContain("não avança");
    const p = planejarQuadro(q, JANELA, cfg, HOJE);
    expect(p.acoesArea.filter((a) => a.tipo !== "area_atualizada")).toEqual([]);
  });

  it("não avisa: com Prazo, cancelado ou concluído, em finalizadas, item único sem data", () => {
    const q = ler([
      { id: "1", rec: "4. Mensal", status: "Não iniciado", prazo: "2026-11-10", area: OPER },
      { id: "2", rec: "4. Mensal", status: "Cancelado", area: OPER },
      { id: "3", rec: "4. Mensal", status: "Concluído", area: OPER },
      { id: "4", rec: "4. Mensal", status: "Não iniciado", grupo: FINAL, area: OPER },
      { id: "5", status: "Em andamento", area: OPER },
    ]);
    expect(q.avisos.filter((a) => a.codigo === "regra_sem_data")).toEqual([]);
  });

  it("continuam visíveis em semPrazo com o motivo próprio, no gestor da área; itens comuns sem data têm motivo sem_prazo", () => {
    const q = ler([...semData, { id: "u1", nome: "Comum sem data", status: "Em andamento", area: OPER }]);
    const { itens, semPrazo } = montarItensJornal([q], cfg);
    expect(itens).toEqual([]);
    const porNome = Object.fromEntries(semPrazo.map((s) => [s.nome, s]));
    expect(porNome["Intercompany WIZ"]).toMatchObject({ motivo: "regra_sem_data", data: null, dono: gestorDaArea(OPER, cfg) });
    expect(porNome["Intercompany BRB"]).toMatchObject({ motivo: "regra_sem_data", dono: gestorDaArea(CTRL, cfg) });
    expect(porNome["Comum sem data"]).toMatchObject({ motivo: "sem_prazo" });
    const e = montarEdicao(itens, HOJE, cfg, "x", semPrazo);
    expect(e.gestores.find((g) => g.nome === gestorDaArea(OPER, cfg))?.contagens.semPrazo).toBe(2);
  });
});
