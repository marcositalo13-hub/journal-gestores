import { describe, expect, it } from "vitest";
import { getConfig, validarConfig } from "../config";
import raw from "../../../config/jornal.config.json";
import { fixturePagamentosAtiva } from "./data-dev";
import { fixturePagamentos } from "./fixture-pagamentos";
import type { ItemEdicao, ItemJornal } from "./itens";
import { montarEdicao } from "./montar";
import { montarPagamentos, motivoAprovacao, MOTIVO_AREA, rotuloVencimento, textoLimite } from "./pagamentos";
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
    status: "Aguardando aprovação",
    categoria: "aberto" as const,
    valor: 1000,
    updatedAt: atualizadoEm ?? "2026-11-05T15:00:00Z",
    ...resto,
  };
  return data === null ? { ...base, data: null, motivo: "sem_prazo" } : { ...base, data };
};
const mp = (itens: ItemEdicao[], hoje = HOJE) => montarPagamentos(itens, hoje, cfg);

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
    const outro = validarConfig({ ...raw, pagamentos: { aprovacao_diretor_a_partir_de: 250000, aprovados_recentes_dias: 7 } });
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
      pag({ data: "2026-11-15", valor: 5000, categoria: "concluido", status: "Aprovado" }),
      pag({ data: "2026-11-16", valor: 7000, categoria: "cancelado", status: "Cancelado" }),
    ]).aguardando;
    expect(a.quantidade).toBe(3);
    expect(a.total).toBe(0.3);
  });

  it("vazio: nenhum aguardando (a página mostra 'Nenhum pagamento aguardando aprovação.')", () => {
    const p = mp([]);
    expect(p.aguardando).toEqual({ itens: [], quantidade: 0, total: 0 });
    expect(p.aprovados).toEqual([]);
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

describe("Aprovados recentemente (últimos 7 dias, pela última atualização em São Paulo)", () => {
  const apr = (nome: string, atualizadoEm: string) => pag({ nome, data: "2026-11-20", categoria: "concluido", status: "Aprovado", atualizadoEm });

  it("limite: 02/11 (hoje − 7) entra; 01/11 não; o mais recente primeiro", () => {
    const a = mp([apr("limite", "2026-11-02T15:00:00Z"), apr("fora", "2026-11-01T15:00:00Z"), apr("ontem", "2026-11-08T15:00:00Z"), apr("hoje", "2026-11-09T15:00:00Z")]).aprovados;
    expect(a.map((i) => i.nome)).toEqual(["hoje", "ontem", "limite"]);
  });
  it("usa a data de São Paulo (02h UTC ainda é o dia anterior)", () => {
    expect(mp([apr("virada", "2026-11-03T02:00:00Z")]).aprovados).toHaveLength(1); // 02/11 23h em SP, dentro
    expect(mp([apr("fora", "2026-11-02T02:00:00Z")]).aprovados).toHaveLength(0); // 01/11 23h em SP, fora
  });
  it("cancelados e aguardando nunca entram", () => {
    const a = mp([pag({ data: "2026-11-20", categoria: "cancelado", atualizadoEm: "2026-11-08T15:00:00Z" }), pag({ data: "2026-11-20", atualizadoEm: "2026-11-08T15:00:00Z" })]).aprovados;
    expect(a).toEqual([]);
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
  it("cobre o cenário da aba: vencidos, hoje, amanhã, sem vencimento, aprovados recentes e antigos, cancelado", () => {
    const p = montarPagamentos(fixturePagamentos(HOJE), HOJE, cfg);
    expect(p.aguardando.itens.map((x) => x.rotulo)).toEqual(["Venceu há 9 dias", "Venceu há 1 dia", "Vence hoje", "Amanhã", "Em 5 dias", "Em 33 dias", "Sem vencimento"]);
    expect(p.aprovados.map((i) => i.nome)).toEqual(["[EXEMPLO] Energia elétrica (aprovada)", "[EXEMPLO] Honorários contábeis (aprovados)"]);
    expect(JSON.stringify(fixturePagamentos(HOJE))).not.toMatch(/Cancelado.*"categoria":"aberto"/);
  });
  it("itens da fixture usam o mesmo motivo de aprovação do config (99999,99 → Área subordinada)", () => {
    const auditoria = fixturePagamentos(HOJE).find((i) => i.nome.includes("Auditoria"))!;
    expect(auditoria.motivoAprovacao).toBe("Área subordinada");
  });
});
