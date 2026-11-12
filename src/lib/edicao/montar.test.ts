import { describe, expect, it } from "vitest";
import { getConfig, type JornalConfig } from "../config";
import type { ItemJornal, ItemSemPrazo } from "./itens";
import { descendentes, montarEdicao, secoesDeHoje } from "./montar";

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

describe("manchete pela urgência", () => {
  const pag = (valor: number, data: string, o: Partial<ItemJornal> = {}) => mk({ tipo: "Pagamento", tipoQuadro: "pagamentos", valor, data, ...o });
  const con = (data: string, o: Partial<ItemJornal> = {}) => mk({ tipo: "Contrato", data, ...o });
  const atras = (data: string, o: Partial<ItemJornal> = {}) => mk({ data, ...o });
  const manchete = (itens: ItemJornal[], hoje = "2026-10-06", sem: ItemSemPrazo[] = []) => montarEdicao(itens, hoje, cfg, GERADO, sem).manchete;

  it("um atrasado (preto) vence um contrato que vence em 2 dias (amarelo)", () => {
    const c = con("2026-10-08");
    const a = atras("2026-10-05", { nome: "Material Panorama" });
    expect(manchete([c, a])).toMatchObject({ regra: "pendencia", nivel: "preto", kicker: "Atrasado há 1 dia", item: { id: a.id } });
  });

  it("preto > vermelho (hoje ou travado) > amarelo; verde nunca é manchete", () => {
    const preto = atras("2026-10-01");
    const hoje = atras("2026-10-06");
    const trav = atras("2026-12-30", { categoria: "travado", observacao: "Sem verba" });
    const amar = atras("2026-10-07");
    const verde = atras("2026-12-01");
    expect(manchete([amar, trav, hoje, preto, verde])?.item.id).toBe(preto.id);
    expect(manchete([amar, trav, hoje, verde])?.nivel).toBe("vermelho");
    expect(manchete([amar, verde])).toMatchObject({ nivel: "amarelo", item: { id: amar.id } });
    expect(manchete([verde, atras("2026-10-01", { categoria: "concluido" })])).toBeNull();
    expect(manchete([])).toBeNull();
  });

  it("desempate no mesmo nível: Contrato primeiro, depois a data (preto: mais antiga; demais: mais próxima), depois o nome", () => {
    const velha = atras("2026-09-28", { nome: "Velha" });
    const nova = atras("2026-10-05", { nome: "Nova" });
    const contratoAtrasado = con("2026-10-05", { nome: "Contrato atrasado" });
    expect(manchete([nova, velha])?.item.id).toBe(velha.id); // preto: mais antiga
    expect(manchete([velha, contratoAtrasado])?.item.id).toBe(contratoAtrasado.id); // contrato antes, mesmo mais novo

    const amanha = atras("2026-10-07", { nome: "Amanhã" });
    const depois = atras("2026-10-08", { nome: "Depois" });
    expect(manchete([depois, amanha])?.item.id).toBe(amanha.id); // mais próxima
    const contratoLonge = con("2026-10-09", { nome: "Contrato" });
    expect(manchete([amanha, contratoLonge])?.item.id).toBe(contratoLonge.id); // contrato antes da data

    const b = atras("2026-10-05", { nome: "Bravo" });
    const a = atras("2026-10-05", { nome: "Alfa" });
    expect(manchete([b, a])?.item.id).toBe(a.id); // nome
  });

  it("um travado sem prazo concorre (vermelho); um sem prazo comum não", () => {
    const sem = (o: Partial<ItemSemPrazo> = {}): ItemSemPrazo => ({ ...mk({ data: "2026-10-06" }), data: null, motivo: "sem_prazo", ...o }) as ItemSemPrazo;
    expect(manchete([], "2026-10-06", [sem()])).toBeNull();
    const t = sem({ categoria: "travado" });
    expect(manchete([], "2026-10-06", [t])).toMatchObject({ regra: "travado", kicker: "Travado", item: { id: t.id } });
  });

  it("pagamentos nunca concorrem à manchete", () => {
    expect(manchete([pag(500_000, "2026-10-01"), pag(1, "2026-10-20", { categoria: "travado" })])).toBeNull();
    const a = atras("2026-10-05");
    expect(manchete([pag(500_000, "2026-10-01"), a])?.item.id).toBe(a.id);
  });
});

describe("manchete: kicker factual e com a cor do nível", () => {
  const con = (data: string, o: Partial<ItemJornal> = {}) => mk({ tipo: "Contrato", data, ...o });
  const m = (itens: ItemJornal[], hoje = "2026-10-06") => ed(itens, hoje).manchete;

  it("contrato: vence hoje / prazo amanhã / prazo em N dias (dias corridos)", () => {
    expect(m([con("2026-10-06")])?.kicker).toBe("Contrato · vence hoje");
    expect(m([con("2026-10-07")])?.kicker).toBe("Contrato · prazo amanhã");
    expect(m([con("2026-10-08")])?.kicker).toBe("Contrato · prazo em 2 dias");
    expect(m([con("2026-10-09")])?.kicker).toBe("Contrato · prazo em 3 dias");
  });

  it("atrasado: Atrasado há N dia(s) (inclusive contrato); travado: Travado", () => {
    expect(m([mk({ data: "2026-10-05" })])?.kicker).toBe("Atrasado há 1 dia");
    expect(m([mk({ data: "2026-09-28" })])?.kicker).toBe("Atrasado há 8 dias");
    expect(m([con("2026-10-01")])).toMatchObject({ kicker: "Atrasado há 5 dias", nivel: "preto" });
    expect(m([mk({ data: "2026-10-30", categoria: "travado" })])).toMatchObject({ kicker: "Travado", nivel: "vermelho" });
  });

  it("vence hoje / prazo amanhã / prazo em N dias para itens comuns", () => {
    expect(m([mk({ data: "2026-10-06" })])).toMatchObject({ kicker: "Vence hoje", nivel: "vermelho" });
    expect(m([mk({ data: "2026-10-07" })])).toMatchObject({ kicker: "Prazo amanhã", nivel: "amarelo" });
    expect(m([mk({ data: "2026-10-09" })])).toMatchObject({ kicker: "Prazo em 3 dias", nivel: "amarelo" });
  });

  it("a expressão antiga nunca aparece", () => {
    const todos = [con("2026-10-06"), con("2026-10-07"), con("2026-10-12"), mk({ data: "2026-10-01" }), mk({ data: "2026-10-30", categoria: "travado" })];
    for (const i of todos) expect(m([i])?.kicker ?? "").not.toMatch(/vencendo/i);
  });
});

describe("dado real: Material Panorama DICOL Mensal · 09/11 (hoje 2026-11-10)", () => {
  it("aparece em pendencias com 1 dia, e é a manchete (preto) à frente do contrato de 11/11", () => {
    const panorama = mk({ nome: "Material Panorama DICOL Mensal · 09/11", dono: "João Silva", data: "2026-11-09", status: "Em andamento" });
    const nda = mk({ nome: "Assinatura NDA Embracon", tipo: "Contrato", dono: "Solange Mata", data: "2026-11-11" });
    const e = ed([nda, panorama], "2026-11-10");
    expect(e.pendencias.map((p) => [p.item.nome, p.diasAtraso])).toEqual([["Material Panorama DICOL Mensal · 09/11", 1]]);
    expect(e.manchete).toMatchObject({ kicker: "Atrasado há 1 dia", nivel: "preto", item: { id: panorama.id } });
    // sem manchete na frente, ele segue na seção Atrasados; o contrato aparece como amarelo
    expect(ed([nda], "2026-11-10").manchete).toMatchObject({ kicker: "Contrato · prazo amanhã", nivel: "amarelo" });
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
    const g = (nome: string, reporta_a: string) => ({ nome, area: "x", area_curta: "x", reporta_a, quadro_id: null });
    const ciclo = { ...cfg, gestores: [g("A", "B"), g("B", "A")] };
    expect(descendentes("A", ciclo)).toEqual(["B"]);
  });
});

describe("pagamentos ficam fora da edição de atividades", () => {
  const pag = (o: Partial<ItemJornal> & { data: string }) => mk({ tipoQuadro: "pagamentos", tipo: "Pagamento", valor: 1000, dono: "Keite Martins", ...o });
  const ativ = (o: Partial<ItemJornal> & { data: string }) => mk({ dono: "Keite Martins", ...o });

  it("nenhuma seção traz pagamentos: hoje, pendências, travados, aviso, semana, sem prazo, manchete, gestores", () => {
    const hojeP = pag({ data: "2026-10-09" }); // sexta (hoje)
    const atrasado = pag({ data: "2026-10-01" });
    const travado = pag({ data: "2026-10-20", categoria: "travado", observacao: "sem NF" });
    const fimDeSemana = pag({ data: "2026-10-10" });
    const semana = pag({ data: "2026-10-13" });
    const concluido = pag({ data: "2026-10-05", categoria: "concluido" });
    const semPrazoP = { ...pag({ data: "2026-10-09" }), data: null } as ItemSemPrazo;
    const a = ativ({ data: "2026-10-09", nome: "Atividade de hoje" });
    const e = montarEdicao([hojeP, atrasado, travado, fimDeSemana, semana, concluido, a], "2026-10-09", cfg, "x", [semPrazoP]);
    const ids = JSON.stringify(e);
    for (const p of [hojeP, atrasado, travado, fimDeSemana, semana, concluido, semPrazoP]) expect(ids).not.toContain(`"${p.id}"`);
    expect(e.hoje.map((i) => i.id)).toEqual([a.id]);
    expect(e.pendencias).toEqual([]);
    expect(e.travados).toEqual([]);
    expect(e.avisoNaoUtil).toBeNull();
    expect(e.semPrazo).toEqual([]);
    expect(e.manchete).toMatchObject({ regra: "hoje", item: { id: a.id } }); // só a atividade de hoje concorre; nenhum pagamento
    // contagens do gestor só de atividades
    const keite = e.gestores.find((g) => g.nome === "Keite Martins")!;
    expect(keite.contagens).toEqual({ hoje: 1, atrasados: 0, travados: 0, semPrazo: 0 });
    expect(keite.mes).toEqual({ concluidos: 0, total: 1 });
  });

  it("dono que só tem pagamentos não aparece como 'fora da estrutura'", () => {
    const e = montarEdicao([pag({ data: "2026-10-09", dono: "Fulano Externo" })], "2026-10-09", cfg, "x");
    expect(e.gestores.map((g) => g.nome)).toEqual(cfg.gestores.map((g) => g.nome));
  });
});

describe("Contratos para análise", () => {
  const HOJE = "2026-11-10";
  const nda = (o: Partial<ItemJornal> = {}) => mk({ nome: "Assinatura NDA Embracon", tipo: "Contrato", data: "2026-11-11", dono: "Solange Mata", ...o });
  const e = (itens: ItemJornal[]) => ed(itens, HOJE);
  const todasAsSecoes = (x: ReturnType<typeof secoesDeHoje>) => [
    ...x.atrasados.map((p) => p.item.id),
    ...x.contratos.map((i) => i.id),
    ...x.hoje.map((i) => i.id),
    ...x.travados.map((t) => t.item.id),
    ...x.semPrazo.map((i) => i.id),
  ];

  it("o NDA de amanhã aparece em Contratos quando a manchete é um item atrasado", () => {
    const c = nda();
    const atrasado = mk({ nome: "Material Panorama", data: "2026-11-09" });
    const ed1 = e([c, atrasado]);
    expect(ed1.manchete?.item.id).toBe(atrasado.id);
    const s = secoesDeHoje(ed1);
    expect(s.contratos.map((i) => i.id)).toEqual([c.id]);
    expect(s.atrasados.map((p) => p.item.id)).toEqual([]); // o atrasado é a manchete: não se repete
  });

  it("Distrato vale como Contrato: entra em 'Para sua assinatura' e a manchete diz 'Distrato · prazo amanhã'", () => {
    const d = nda({ nome: "Assinatura Distrato Anexo 3", tipo: "Distrato" });
    const ed1 = e([d]);
    expect(ed1.contratos.map((i) => i.id)).toEqual([d.id]);
    expect(ed1.manchete).toMatchObject({ regra: "contrato", kicker: "Distrato · prazo amanhã", motivo: "Distrato com prazo amanhã." });
    const atrasado = mk({ nome: "Material", data: "2026-11-09" });
    expect(secoesDeHoje(e([d, atrasado])).contratos.map((i) => i.id)).toEqual([d.id]);
  });

  it("desempate da manchete: Distrato ganha de uma atividade comum no mesmo nível e na mesma data", () => {
    const comum = mk({ nome: "A atividade", data: "2026-11-11", dono: "Solange Mata" });
    const d = nda({ nome: "Z distrato", tipo: "Distrato" });
    expect(e([comum, d]).manchete?.item.id).toBe(d.id);
  });

  it("kicker de Contrato continua 'Contrato · …'; tipo fora de tipos_assinatura (Entrega) não é assinatura", () => {
    expect(e([nda()]).manchete?.kicker).toBe("Contrato · prazo amanhã");
    expect(e([mk({ tipo: "Entrega", data: "2026-11-11" })]).contratos).toEqual([]);
  });

  it("janela [hoje, hoje + 10]: hoje e +10 entram; +11 não; ordenados por data e nome", () => {
    const a = nda({ nome: "B", data: "2026-11-20" });
    const b = nda({ nome: "A", data: "2026-11-20" });
    const c = nda({ nome: "C", data: "2026-11-10" });
    const longe = nda({ nome: "Longe", data: "2026-11-21" });
    expect(e([a, b, c, longe]).contratos.map((i) => i.nome)).toEqual(["C", "A", "B"]);
  });

  it("o contrato que é a manchete não se repete na seção", () => {
    const c = nda();
    const ed1 = e([c]);
    expect(ed1.manchete?.item.id).toBe(c.id);
    expect(ed1.contratos.map((i) => i.id)).toEqual([c.id]); // a edição o traz...
    expect(secoesDeHoje(ed1).contratos).toEqual([]); // ...e a tela Hoje o tira
  });

  it("contrato atrasado fica só em Atrasados; concluído, cancelado e travado não entram; outros tipos não", () => {
    const atrasado = nda({ data: "2026-11-09" });
    const outros = [nda({ categoria: "concluido" }), nda({ categoria: "cancelado" }), nda({ categoria: "travado" }), mk({ tipo: "Entrega", data: "2026-11-11" })];
    const ed1 = e([atrasado, ...outros]);
    expect(ed1.contratos).toEqual([]);
    expect(ed1.pendencias.map((p) => p.item.id)).toEqual([atrasado.id]);
  });

  it("contrato que vence hoje aparece em Contratos, não em Hoje", () => {
    const c = nda({ data: HOJE });
    const comum = mk({ nome: "Outra de hoje", data: HOJE });
    const urgente = mk({ nome: "Atrasada", data: "2026-11-01" }); // vira a manchete
    const s = secoesDeHoje(e([c, comum, urgente]));
    expect(s.contratos.map((i) => i.id)).toEqual([c.id]);
    expect(s.hoje.map((i) => i.id)).toEqual([comum.id]);
  });

  it("nenhum item aparece em duas seções", () => {
    const itens = [
      nda({ data: HOJE }),
      nda({ nome: "Outro contrato", data: "2026-11-15" }),
      nda({ nome: "Contrato atrasado", data: "2026-11-05" }),
      nda({ nome: "Contrato travado", data: "2026-11-12", categoria: "travado" }),
      mk({ nome: "Comum hoje", data: HOJE }),
      mk({ nome: "Atrasada", data: "2026-11-01" }),
      mk({ nome: "Travada", data: "2026-12-30", categoria: "travado" }),
    ];
    const ed1 = montarEdicao(itens, HOJE, cfg, GERADO, [{ ...mk({ nome: "Sem data", data: HOJE }), data: null, motivo: "sem_prazo" } as ItemSemPrazo]);
    const ids = todasAsSecoes(secoesDeHoje(ed1));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(ed1.manchete!.item.id);
  });
});
