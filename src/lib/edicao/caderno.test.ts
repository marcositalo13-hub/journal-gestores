import { describe, expect, it } from "vitest";
import { getConfig } from "../config";
import { hierarquia, montarCaderno, slugDe } from "./caderno";
import type { ItemJornal, ItemSemPrazo } from "./itens";

const cfg = getConfig();
const HOJE = "2026-10-06";
let n = 0;
const mk = (o: Partial<ItemJornal> & { data: string; dono: string }): ItemJornal => {
  n++;
  return {
    id: `c${n}`,
    nome: `Item ${n}`,
    quadroId: "200",
    tipoQuadro: "atividades",
    tipo: "Atividade",
    status: "Em andamento",
    categoria: "aberto",
    updatedAt: "2026-10-01T00:00:00Z",
    ...o,
  };
};
const sp = (o: Partial<ItemSemPrazo> & { dono: string }): ItemSemPrazo => {
  n++;
  return { id: `s${n}`, nome: `Sem prazo ${n}`, quadroId: "200", tipoQuadro: "atividades", tipo: "Atividade", status: "Em andamento", categoria: "aberto", updatedAt: "x", data: null, ...o };
};
const cad = (itens: ItemJornal[], nome: string, equipe = false, semPrazo: ItemSemPrazo[] = []) => montarCaderno(itens, semPrazo, HOJE, cfg, nome, equipe)!;

describe("slugDe", () => {
  it("minúsculas, sem acentos, hífens", () => {
    expect(slugDe("Solange Mata")).toBe("solange-mata");
    expect(slugDe("João Silva")).toBe("joao-silva");
    expect(slugDe("TESTE")).toBe("teste");
    expect(slugDe("  Ana  D'Ávila ")).toBe("ana-d-avila");
  });
  it("todos os gestores do config têm slug único", () => {
    const s = cfg.gestores.map((g) => slugDe(g.nome));
    expect(new Set(s).size).toBe(s.length);
  });
});

describe("hierarquia", () => {
  it("Solange Mata no topo; diretos com nível 1; equipe do Lucas com nível 2 logo abaixo dele", () => {
    const h = hierarquia(cfg);
    expect(h[0]).toEqual({ nome: "Solange Mata", nivel: 0 });
    expect(h).toHaveLength(cfg.gestores.length);
    const i = h.findIndex((x) => x.nome === "Lucas Martins");
    expect(h[i].nivel).toBe(1);
    expect(h.slice(i + 1, i + 3)).toEqual([
      { nome: "Vanessa Petri", nivel: 2 },
      { nome: "Danielle Aquino", nivel: 2 },
    ]);
    for (const nome of ["Solange Mescouto", "Keite Martins", "João Silva", "Graziely Palma"]) expect(h.find((x) => x.nome === nome)?.nivel).toBe(1);
  });
});

describe("montarCaderno", () => {
  it("nome desconhecido → null; dono fora do config (TESTE) → caderno sem área/equipe", () => {
    expect(montarCaderno([], [], HOJE, cfg, "Ninguém", false)).toBeNull();
    const c = cad([mk({ dono: "TESTE", data: "2026-10-05" })], "TESTE", true);
    expect(c.gestor).toEqual({ nome: "TESTE", area: null, reportaA: null });
    expect(c.temEquipe).toBe(false);
    expect(c.incluiEquipe).toBe(false);
    expect(c.atrasados).toHaveLength(1);
  });

  it("gestor do config sem itens ainda tem caderno (vazio)", () => {
    const c = cad([], "Keite Martins");
    expect(c.gestor).toMatchObject({ area: "Coordenação Administrativa e Financeira", reportaA: "Solange Mata" });
    expect(c.temEquipe).toBe(false);
    expect([c.atrasados, c.travados, c.hoje, c.proximos14, c.semPrazo].every((x) => x.length === 0)).toBe(true);
  });

  it("itens do quadro de Pagamentos (dono Solange Mata) aparecem no caderno dela", () => {
    const aluguel = mk({ dono: "Solange Mata", tipoQuadro: "pagamentos", tipo: "Pagamento", valor: 80000, data: "2026-10-09", status: "Previsto" });
    const c = cad([aluguel, mk({ dono: "Lucas Martins", data: "2026-10-09" })], "Solange Mata");
    expect(c.proximos14).toEqual([{ data: "2026-10-09", ehDiaUtil: true, itens: [aluguel] }]);
  });

  it("incluir equipe soma descendentes via reporta_a (inclusive a equipe do Lucas) e mantém o dono", () => {
    const itens = [
      mk({ dono: "Solange Mata", data: "2026-10-05" }),
      mk({ dono: "Lucas Martins", data: "2026-10-04" }),
      mk({ dono: "Vanessa Petri", data: "2026-10-03" }),
      mk({ dono: "Danielle Aquino", data: "2026-10-02" }),
      mk({ dono: "TESTE", data: "2026-10-01" }),
    ];
    const so = cad(itens, "Solange Mata");
    expect(so.temEquipe).toBe(true);
    expect(so.atrasados.map((a) => a.item.dono)).toEqual(["Solange Mata"]);
    const comEquipe = cad(itens, "Solange Mata", true);
    expect(comEquipe.incluiEquipe).toBe(true);
    expect(comEquipe.atrasados.map((a) => a.item.dono)).toEqual(["Danielle Aquino", "Vanessa Petri", "Lucas Martins", "Solange Mata"]);
    expect(comEquipe.atrasados.map((a) => a.diasAtraso)).toEqual([4, 3, 2, 1]);
    const lucas = cad(itens, "Lucas Martins", true);
    expect(lucas.atrasados.map((a) => a.item.dono)).toEqual(["Danielle Aquino", "Vanessa Petri", "Lucas Martins"]);
    expect(cad(itens, "Vanessa Petri", true).incluiEquipe).toBe(false); // folha: sem equipe
  });

  it("janela de 14 dias: hoje+1 … hoje+14, só dias com itens em aberto, dias não úteis marcados", () => {
    const c = cad(
      [
        mk({ dono: "Lucas Martins", data: "2026-10-06" }), // hoje: fora de proximos14
        mk({ dono: "Lucas Martins", data: "2026-10-07", nome: "B" }),
        mk({ dono: "Lucas Martins", data: "2026-10-07", nome: "A" }),
        mk({ dono: "Lucas Martins", data: "2026-10-12" }), // feriado
        mk({ dono: "Lucas Martins", data: "2026-10-20" }), // hoje+14
        mk({ dono: "Lucas Martins", data: "2026-10-21" }), // hoje+15: fora
        mk({ dono: "Lucas Martins", data: "2026-10-08", categoria: "concluido" }), // concluído: fora
        mk({ dono: "Lucas Martins", data: "2026-10-09", categoria: "cancelado" }),
      ],
      "Lucas Martins",
    );
    expect(c.proximos14.map((d) => [d.data, d.ehDiaUtil, d.itens.map((i) => i.nome)])).toEqual([
      ["2026-10-07", true, ["A", "B"]],
      ["2026-10-12", false, [expect.any(String)]],
      ["2026-10-20", true, [expect.any(String)]],
    ]);
    expect(c.hoje).toHaveLength(1);
  });

  it("ordenação: atrasados mais antigos primeiro; hoje com concluídos por último; travados datados antes dos sem data", () => {
    const tSem = sp({ dono: "Lucas Martins", categoria: "travado", nome: "Travado sem data" });
    const c = cad(
      [
        mk({ dono: "Lucas Martins", data: "2026-10-05", nome: "recente" }),
        mk({ dono: "Lucas Martins", data: "2026-09-29", nome: "antigo" }),
        mk({ dono: "Lucas Martins", data: HOJE, nome: "A feito", categoria: "concluido" }),
        mk({ dono: "Lucas Martins", data: HOJE, nome: "Z aberto" }),
        mk({ dono: "Lucas Martins", data: "2026-10-30", categoria: "travado", nome: "Travado futuro", observacao: "Aguardando" }),
      ],
      "Lucas Martins",
      false,
      [tSem, sp({ dono: "Lucas Martins", categoria: "concluido" })],
    );
    expect(c.atrasados.map((a) => a.item.nome)).toEqual(["antigo", "recente"]);
    expect(c.hoje.map((i) => i.nome)).toEqual(["Z aberto", "A feito"]);
    expect(c.travados.map((t) => [t.item.nome, t.motivo])).toEqual([
      ["Travado futuro", "Aguardando"],
      ["Travado sem data", null],
    ]);
    expect(c.semPrazo.map((i) => i.nome)).toEqual(["Travado sem data"]); // concluído sem prazo não entra
  });

  it("mês: do dia 1 até hoje, sem cancelados", () => {
    const c = cad(
      [
        mk({ dono: "Lucas Martins", data: "2026-10-01", categoria: "concluido" }),
        mk({ dono: "Lucas Martins", data: "2026-10-06" }),
        mk({ dono: "Lucas Martins", data: "2026-10-03", categoria: "cancelado" }),
        mk({ dono: "Lucas Martins", data: "2026-09-30", categoria: "concluido" }),
        mk({ dono: "Lucas Martins", data: "2026-10-07", categoria: "concluido" }),
      ],
      "Lucas Martins",
    );
    expect(c.mes).toEqual({ concluidos: 1, total: 2 });
  });
});
