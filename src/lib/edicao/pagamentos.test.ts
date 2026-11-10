import { describe, expect, it } from "vitest";
import { getConfig, validarConfig } from "../config";
import raw from "../../../config/jornal.config.json";
import { fixturePagamentosAtiva } from "./data-dev";
import { fixturePagamentos } from "./fixture-pagamentos";
import type { ItemEdicao, ItemJornal } from "./itens";
import { montarEdicao } from "./montar";
import { agruparAutorizados, montarPagamentos, motivoAprovacao, MOTIVO_AREA, rotuloVencimento, textoLimite } from "./pagamentos";
import { nivelUrgencia } from "./urgencia";

const cfg = getConfig();
const HOJE = "2026-11-09"; // segunda-feira
let n = 0;
const pag = (o: Omit<Partial<ItemJornal>, "data"> & { data: string | null; atualizadoEm?: string }): ItemEdicao => {
  n++;
  const { data, atualizadoEm, ...resto } = o;
  const base = {
    id: `p${n}`,
    nome: `Pag ${n}`,
    quadroId: "100",
    tipoQuadro: "pagamentos" as const,
    dono: "Egídio",
    tipo: "Pagamento" as const,
    status: "Aguardando autorização",
    categoria: "aberto" as const,
    valor: 1000,
    updatedAt: atualizadoEm ?? "2026-11-05T15:00:00Z",
    ...resto,
  };
  return data === null ? { ...base, data: null, motivo: "sem_prazo" } : { ...base, data };
};
const mp = (itens: ItemEdicao[], hoje = HOJE) => montarPagamentos(itens, hoje);

describe("motivoAprovacao (limite no config)", () => {
  it("99999,99 → Área subordinada; 100000 → Acima de R$ 100 mil (limite inclusivo)", () => {
    expect(cfg.pagamentos.aprovacao_diretor_a_partir_de).toBe(100000);
    expect(motivoAprovacao(99999.99, cfg)).toBe(MOTIVO_AREA);
    expect(motivoAprovacao(99999.99, cfg)).toBe("Área subordinada");
    expect(motivoAprovacao(100000, cfg)).toBe("Acima de R$ 100 mil");
    expect(motivoAprovacao(100000.01, cfg)).toBe("Acima de R$ 100 mil");
    expect(motivoAprovacao(0, cfg)).toBe("Área subordinada");
  });
  it("o texto vem do limite do config, não de um número escrito no código", () => {
    const outro = validarConfig({ ...raw, pagamentos: { aprovacao_diretor_a_partir_de: 250000 } });
    expect(motivoAprovacao(249999.99, outro)).toBe("Área subordinada");
    expect(motivoAprovacao(250000, outro)).toBe("Acima de R$ 250 mil");
    expect(textoLimite(100000)).toBe("R$ 100 mil");
    expect(textoLimite(1500)).toBe("R$ 1.500,00");
  });
});

describe("rotuloVencimento (dias corridos)", () => {
  it("Vence hoje · Amanhã · Em N dias · Venceu há N dias", () => {
    expect(rotuloVencimento(0)).toBe("Vence hoje");
    expect(rotuloVencimento(1)).toBe("Amanhã");
    expect(rotuloVencimento(2)).toBe("Em 2 dias");
    expect(rotuloVencimento(30)).toBe("Em 30 dias");
    expect(rotuloVencimento(-1)).toBe("Venceu há 1 dia");
    expect(rotuloVencimento(-9)).toBe("Venceu há 9 dias");
  });
});

describe("Aguardando sua aprovação", () => {
  it("ordem por vencimento (vencidos primeiro), empate por nome, sem vencimento por último; rótulos e dias", () => {
    const a = mp([
      pag({ nome: "Z longe", data: "2026-12-20" }),
      pag({ nome: "Sem data", data: null }),
      pag({ nome: "B hoje", data: HOJE }),
      pag({ nome: "A hoje", data: HOJE }),
      pag({ nome: "Vencido", data: "2026-11-01" }),
      pag({ nome: "Amanhã", data: "2026-11-10" }),
    ]).aguardando;
    expect(a.itens.map((x) => [x.item.nome, x.rotulo, x.dias])).toEqual([
      ["Vencido", "Venceu há 8 dias", -8],
      ["A hoje", "Vence hoje", 0],
      ["B hoje", "Vence hoje", 0],
      ["Amanhã", "Amanhã", 1],
      ["Z longe", "Em 41 dias", 41],
      ["Sem data", "Sem vencimento", null],
    ]);
  });

  it("quantidade e total (centavos exatos; sem valor conta zero); aprovados e cancelados ficam de fora", () => {
    const a = mp([
      pag({ data: "2026-11-12", valor: 0.1 }),
      pag({ data: "2026-11-13", valor: 0.2 }),
      pag({ data: "2026-11-14", valor: undefined }),
      pag({ data: "2026-11-15", valor: 5000, categoria: "concluido", status: "Autorizado" }),
      pag({ data: "2026-11-16", valor: 7000, categoria: "cancelado", status: "Cancelado" }),
    ]).aguardando;
    expect(a.quantidade).toBe(3);
    expect(a.total).toBe(0.3);
  });

  it("vazio: nenhum aguardando (a página mostra 'Nenhum pagamento aguardando autorização.')", () => {
    const p = mp([]);
    expect(p.aguardando).toEqual({ itens: [], quantidade: 0, total: 0 });
    expect(p.autorizados).toEqual([]);
    expect(mp([pag({ data: "2026-11-01", categoria: "concluido" })]).aguardando.quantidade).toBe(0);
  });

  it("a cor da barra segue a urgência: vencido preto, hoje vermelho, perto amarelo, longe verde, sem data amarelo", () => {
    const nivel = (data: string | null) => nivelUrgencia(pag({ data }), HOJE, cfg);
    expect(nivel("2026-11-08")).toBe("preto");
    expect(nivel(HOJE)).toBe("vermelho");
    expect(nivel("2026-11-12")).toBe("amarelo"); // 3 dias úteis
    expect(nivel("2026-12-20")).toBe("verde");
    expect(nivel(null)).toBe("amarelo");
  });

  it("só itens de quadros de pagamentos entram", () => {
    const atividade: ItemJornal = { ...(pag({ data: HOJE }) as ItemJornal), tipoQuadro: "atividades", tipo: "Atividade" };
    expect(mp([atividade]).aguardando.quantidade).toBe(0);
  });
});

describe("Autorizados: agrupados pelo mês de 'Autorizado em'", () => {
  const aut = (nome: string, autorizadoEm?: string, o: Partial<ItemJornal> = {}) =>
    pag({ nome, data: "2026-11-20", categoria: "concluido", status: "Autorizado", autorizadoPor: "Egídio", ...(autorizadoEm ? { autorizadoEm } : {}), ...o });

  it("meses do mais recente ao mais antigo; dentro do mês, a autorização mais recente primeiro (empate: nome)", () => {
    const g = agruparAutorizados([aut("B out", "2026-10-03"), aut("nov 2", "2026-11-02"), aut("A out", "2026-10-03"), aut("nov 9", "2026-11-09"), aut("dez/25", "2025-12-31")]);
    expect(g.map((m) => [m.chave, m.rotulo, m.itens.map((i) => i.nome)])).toEqual([
      ["2026-11", "Novembro de 2026", ["nov 9", "nov 2"]],
      ["2026-10", "Outubro de 2026", ["A out", "B out"]],
      ["2025-12", "Dezembro de 2025", ["dez/25"]],
    ]);
  });

  it("sem 'Autorizado em' (autorizado direto no monday) vai para o último grupo", () => {
    const g = agruparAutorizados([aut("sem data"), aut("com data", "2026-01-15")]);
    expect(g.map((m) => [m.chave, m.rotulo])).toEqual([
      ["2026-01", "Janeiro de 2026"],
      ["sem-data", "Sem data de autorização"],
    ]);
  });

  it("montarPagamentos: só Autorizado (categoria concluído), de qualquer grupo; cancelados e aguardando nunca", () => {
    const p = mp([aut("ok", "2026-11-05"), pag({ data: "2026-11-20", categoria: "cancelado" }), pag({ data: "2026-11-20" })]);
    expect(p.autorizados.flatMap((m) => m.itens.map((i) => i.nome))).toEqual(["ok"]);
  });
});

describe("pagamentos fora da edição (Hoje, contagens dos gestores, manchete)", () => {
  const atividade = (o: Partial<ItemJornal> = {}): ItemJornal => ({
    id: "a1",
    nome: "Conciliação",
    quadroId: "200",
    tipoQuadro: "atividades",
    dono: "Keite Martins",
    tipo: "Atividade",
    data: HOJE,
    status: "Não iniciado",
    categoria: "aberto",
    updatedAt: "2026-11-05T15:00:00Z",
    ...o,
  });
  const itens = (): { itens: ItemJornal[]; semPrazo: never[] } => ({
    itens: [
      atividade(),
      // pagamentos de todo jeito: hoje, vencido, aguardando, aprovado
      pag({ nome: "Pag hoje", data: HOJE }) as ItemJornal,
      pag({ nome: "Pag vencido", data: "2026-11-02" }) as ItemJornal,
      pag({ nome: "Pag aprovado", data: HOJE, categoria: "concluido" }) as ItemJornal,
      pag({ nome: "Pag grande", data: HOJE, valor: 500000 }) as ItemJornal,
    ],
    semPrazo: [],
  });

  it("não aparecem em Hoje, pendências, travados, sem prazo, semana nem manchete", () => {
    const { itens: todos } = itens();
    const e = montarEdicao(todos, HOJE, cfg, "2026-11-09T12:00:00Z", [pag({ nome: "Pag sem data", data: null }) as never]);
    const nomes = (l: { nome: string }[]) => l.map((i) => i.nome);
    expect(nomes(e.hoje)).toEqual(["Conciliação"]);
    expect(e.pendencias).toEqual([]);
    expect(e.travados).toEqual([]);
    expect(e.semPrazo).toEqual([]);
    expect(e.semana.flatMap((d) => nomes(d.itens))).toEqual([]);
    expect(e.manchete?.item.nome).toBe("Conciliação");
  });

  it("não entram nas contagens dos gestores nem criam um 'gestor' novo (o diretor)", () => {
    const e = montarEdicao(itens().itens, HOJE, cfg, "2026-11-09T12:00:00Z");
    const keite = e.gestores.find((g) => g.nome === "Keite Martins")!;
    expect(keite.contagens).toEqual({ hoje: 1, atrasados: 0, travados: 0, semPrazo: 0 });
    expect(e.gestores.map((g) => g.nome)).toEqual(cfg.gestores.map((g) => g.nome));
    expect(e.gestores.some((g) => g.nome === cfg.diretor)).toBe(false);
    expect(e.gestores.every((g) => g.contagens.atrasados === 0)).toBe(true);
  });

  it("só pagamentos: a edição sai vazia", () => {
    const so = itens().itens.filter((i) => i.tipoQuadro === "pagamentos");
    const e = montarEdicao(so, HOJE, cfg, "2026-11-09T12:00:00Z");
    expect(e.hoje).toEqual([]);
    expect(e.pendencias).toEqual([]);
    expect(e.manchete).toBeNull();
    expect(e.gestores.every((g) => g.contagens.hoje === 0 && g.nivel === null)).toBe(true);
  });
});

describe("fixture de desenvolvimento (?fixture=pagamentos)", () => {
  it("só fora de produção", () => {
    expect(fixturePagamentosAtiva("pagamentos", "development")).toBe(true);
    expect(fixturePagamentosAtiva("pagamentos", "production")).toBe(false);
    expect(fixturePagamentosAtiva("outra", "development")).toBe(false);
  });
  it("cobre o cenário da aba: vencidos, hoje, amanhã, sem vencimento, autorizados em meses diferentes, cancelado", () => {
    const p = montarPagamentos(fixturePagamentos(HOJE), HOJE);
    expect(p.aguardando.itens.map((x) => x.rotulo)).toEqual(["Venceu há 9 dias", "Venceu há 1 dia", "Vence hoje", "Amanhã", "Em 5 dias", "Em 33 dias", "Sem vencimento"]);
    expect(p.autorizados.map((m) => m.chave)).toEqual(["2026-11", "2026-09", "sem-data"]);
    expect(p.autorizados[0].itens.map((i) => i.nome)).toEqual(["[EXEMPLO] Energia elétrica", "[EXEMPLO] Honorários contábeis"]);
    expect(JSON.stringify(fixturePagamentos(HOJE))).not.toMatch(/Cancelado.*"categoria":"aberto"/);
  });
  it("itens da fixture usam o mesmo motivo de aprovação do config (99999,99 → Área subordinada)", () => {
    const auditoria = fixturePagamentos(HOJE).find((i) => i.nome.includes("Auditoria"))!;
    expect(auditoria.motivoAprovacao).toBe("Área subordinada");
  });
});
