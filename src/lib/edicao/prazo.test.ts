// Prazo movido para os subitens (monday multi-level copia/limpa a data do pai) e itens sem prazo.
import { describe, expect, it } from "vitest";
import { datasDeSubitens, normalizarQuadro, type ItemNormalizado, type QuadroLido } from "../coletor/ler";
import { getConfig } from "../config";
import { montarItensJornal, type ItemJornal, type ItemSemPrazo } from "./itens";
import { montarEdicao } from "./montar";

const cfg = getConfig();

// ---------- rule 3: ler.ts (aviso do coletor) ----------
const qc = { id: "200", tipo: "atividades" as const, dono: "TESTE" };
const colunas = [
  { id: "c_tipo", title: "Tipo", type: "status" },
  { id: "c_prazo", title: "Prazo", type: "date" },
  { id: "c_status", title: "Status", type: "status" },
  { id: "c_rec", title: "Recorrência", type: "dropdown" },
  { id: "c_resp", title: "Responsável", type: "text" },
  { id: "c_obs", title: "Observação / Bloqueio", type: "text" },
  { id: "c_chave", title: "Chave", type: "text" },
];
const quadroApi = {
  id: "200",
  name: "Atividades",
  hierarchy_type: "multi_level",
  columns: colunas,
  groups: [
    { id: "g1", title: "Cadastro", position: "1" },
    { id: "g2", title: "Outubro 2026", position: "2" },
  ],
  items_page: { cursor: null, items: [] },
};
const sub = (data: string | null, status: string) => ({
  id: "s",
  column_values: [
    { id: "x1", text: data, date: data, column: { title: "Prazo" } },
    { id: "x2", text: status, label: status, column: { title: "Status" } },
  ],
});
const itemApi = (o: { id: string; grupo: string; prazo: string | null; rec?: string; subs?: ReturnType<typeof sub>[] }) => ({
  id: o.id,
  name: `Item ${o.id}`,
  url: "https://x.monday.com/1",
  updated_at: "2026-10-05T10:00:00Z",
  group: { id: o.grupo === "Cadastro" ? "g1" : "g2", title: o.grupo },
  column_values: [
    { id: "c_prazo", text: o.prazo, date: o.prazo },
    { id: "c_status", text: "Em andamento", label: "Em andamento" },
    { id: "c_rec", text: o.rec ?? "Não recorrente" },
  ],
  subitems: o.subs ?? [],
});
const avisosPrazo = (itens: ReturnType<typeof itemApi>[]) =>
  normalizarQuadro(qc, quadroApi, itens, cfg).avisos.filter((a) => a.codigo === "prazo_movido_para_subitens");

describe("datasDeSubitens", () => {
  it("lê a coluna de data por título e ignora subitens cancelados", () => {
    const r = datasDeSubitens([sub("2026-10-28", "Em andamento"), sub("2026-11-02", "Cancelado"), sub(null, "Concluído"), sub("2026-10-30", "Concluído")], "Prazo", "Status", "Cancelado");
    expect(r).toEqual(["2026-10-28", "2026-10-30"]);
  });
});

describe("aviso prazo_movido_para_subitens (ler.ts)", () => {
  it("item em grupo de mês sem data cujos subitens têm data → aviso com id do item", () => {
    const a = avisosPrazo([itemApi({ id: "1", grupo: "Outubro 2026", prazo: null, subs: [sub("2026-10-30", "Em andamento")] })]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ itemId: "1", quadroId: "200" });
    expect(a[0].mensagem).toContain("2026-10-30");
  });
  it("sem aviso: pai com data; sem datas nos subitens; só subitens cancelados; item do Cadastro", () => {
    expect(avisosPrazo([itemApi({ id: "2", grupo: "Outubro 2026", prazo: "2026-10-30", subs: [sub("2026-10-30", "Em andamento")] })])).toEqual([]);
    expect(avisosPrazo([itemApi({ id: "3", grupo: "Outubro 2026", prazo: null, subs: [sub(null, "Em andamento")] })])).toEqual([]);
    expect(avisosPrazo([itemApi({ id: "4", grupo: "Outubro 2026", prazo: null, subs: [sub("2026-10-30", "Cancelado")] })])).toEqual([]);
    expect(avisosPrazo([itemApi({ id: "5", grupo: "Cadastro", prazo: null, subs: [sub("2026-10-30", "Em andamento")] })])).toEqual([]);
  });
  it("etapas e datasSubitens saem normalizados (cancelado fora de ambos)", () => {
    const q = normalizarQuadro(
      qc,
      quadroApi,
      [itemApi({ id: "6", grupo: "Outubro 2026", prazo: null, subs: [sub("2026-10-28", "Concluído"), sub("2026-10-30", "Em andamento"), sub("2026-11-02", "Cancelado")] })],
      cfg,
    );
    expect(q.itens[0].etapas).toEqual({ total: 2, concluidas: 1 });
    expect(q.itens[0].datasSubitens).toEqual(["2026-10-28", "2026-10-30"]);
  });
});

// ---------- rules 1–2: itens.ts ----------
let n = 0;
function pai(o: Partial<Omit<ItemNormalizado, "grupo">> & { grupo?: string; tipo?: QuadroLido["tipo"] }): ItemNormalizado {
  n++;
  const { grupo = "Outubro 2026", ...resto } = o;
  return {
    id: `p${n}`,
    nome: `Pai ${n}`,
    url: "https://x.monday.com/1",
    updatedAt: "2026-10-05T10:00:00Z",
    grupo: { id: "g", titulo: grupo },
    noCadastro: grupo === "Cadastro",
    valores: {},
    data: null,
    status: "Em andamento",
    recorrencia: null,
    chave: null,
    motivo: null,
    etapas: null,
    datasSubitens: [],
    ...resto,
  };
}
const quadro = (itens: ItemNormalizado[], dono = "TESTE"): QuadroLido => ({
  id: "200",
  nome: "Atividades",
  tipo: "atividades",
  dono,
  hierarchyType: "multi_level",
  grupos: [],
  colunas: {},
  itens,
  avisos: [],
});

describe("data herdada dos subitens", () => {
  it("sem data no pai → usa a mais recente dos subitens e marca dataHerdada", () => {
    const { itens, semPrazo } = montarItensJornal([quadro([pai({ nome: "Contrato", datasSubitens: ["2026-10-28", "2026-10-30", "2026-10-29"] })])]);
    expect(semPrazo).toEqual([]);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ nome: "Contrato", data: "2026-10-30", dataHerdada: true });
  });
  it("pai com data mantém a sua e não tem dataHerdada", () => {
    const { itens } = montarItensJornal([quadro([pai({ data: "2026-10-20", datasSubitens: ["2026-10-30"] })])]);
    expect(itens[0].data).toBe("2026-10-20");
    expect(itens[0]).not.toHaveProperty("dataHerdada");
  });
  it("vale também para avulso 'Não recorrente' no Cadastro", () => {
    const { itens } = montarItensJornal([quadro([pai({ grupo: "Cadastro", recorrencia: "Não recorrente", datasSubitens: ["2026-10-30"] })])]);
    expect(itens[0]).toMatchObject({ data: "2026-10-30", dataHerdada: true });
  });
});

describe("itens sem prazo nunca somem", () => {
  it("sem data nem nos subitens → semPrazo (com dono), fora de itens", () => {
    const { itens, semPrazo } = montarItensJornal([quadro([pai({ nome: "Sem data" })], "Lucas Martins")]);
    expect(itens).toEqual([]);
    expect(semPrazo).toHaveLength(1);
    expect(semPrazo[0]).toMatchObject({ nome: "Sem data", dono: "Lucas Martins", data: null, categoria: "aberto" });
  });
  it("regras recorrentes do Cadastro continuam excluídas (mesmo sem data)", () => {
    const r = montarItensJornal([quadro([pai({ grupo: "Cadastro", recorrencia: "Mensal" })])]);
    expect(r.itens).toEqual([]);
    expect(r.semPrazo).toEqual([]);
  });
});

// ---------- rule 2: montar.ts ----------
const base = {
  quadroId: "200",
  tipoQuadro: "atividades" as const,
  tipo: "Atividade" as const,
  status: "Em andamento",
  categoria: "aberto" as const,
  updatedAt: "2026-10-01T00:00:00Z",
};
let m = 0;
const sp = (o: Partial<ItemSemPrazo> = {}): ItemSemPrazo => {
  m++;
  return { ...base, id: `sp${m}`, nome: `Sem prazo ${m}`, dono: "TESTE", data: null, ...o };
};
const com = (o: Partial<ItemJornal> & { data: string }): ItemJornal => {
  m++;
  return { ...base, id: `c${m}`, nome: `Com prazo ${m}`, dono: "TESTE", ...o };
};
const ed = (itens: ItemJornal[], semPrazo: ItemSemPrazo[]) => montarEdicao(itens, "2026-10-06", cfg, "2026-10-06T14:00:00Z", semPrazo);

describe("edicao.semPrazo e contagens", () => {
  it("lista só aberto/travado; concluídos e cancelados sem prazo ficam de fora", () => {
    const a = sp({ nome: "B aberto" });
    const t = sp({ nome: "A travado", categoria: "travado", status: "Travado" });
    const c = sp({ categoria: "concluido" });
    const x = sp({ categoria: "cancelado" });
    const e = ed([], [a, t, c, x]);
    expect(e.semPrazo.map((i) => i.id)).toEqual([t.id, a.id]); // por nome
  });

  it("travado sem data aparece em travados (depois dos datados) e pode ser a manchete (d)", () => {
    const semData = sp({ nome: "Travado sem data", categoria: "travado", status: "Travado", observacao: "Aguardando verba" });
    const comData = com({ data: "2026-10-30", categoria: "travado", status: "Travado" });
    const e = ed([comData], [semData]);
    expect(e.travados.map((t) => [t.item.id, t.item.data])).toEqual([
      [comData.id, "2026-10-30"],
      [semData.id, null],
    ]);
    expect(e.travados[1].motivo).toBe("Aguardando verba");
    const so = ed([], [semData]);
    expect(so.manchete).toMatchObject({ regra: "travado", item: { id: semData.id }, motivo: "Aguardando verba" });
    expect(so.pendencias).toEqual([]);
    expect(so.hoje).toEqual([]);
  });

  it("contagens.semPrazo por gestor (e travados sem data contam em travados); dono fora do config entra", () => {
    const e = ed(
      [],
      [
        sp({ dono: "Lucas Martins" }),
        sp({ dono: "Lucas Martins", categoria: "travado" }),
        sp({ dono: "Lucas Martins", categoria: "cancelado" }),
        sp({ dono: "Fulano Novo" }),
      ],
    );
    const lucas = e.gestores.find((g) => g.nome === "Lucas Martins")!;
    expect(lucas.contagens).toMatchObject({ semPrazo: 2, travados: 1, atrasados: 0, hoje: 0 });
    expect(e.gestores.find((g) => g.nome === "Solange Mata")!.contagens.semPrazo).toBe(0);
    expect(e.gestores.at(-1)).toMatchObject({ nome: "Fulano Novo", contagens: { semPrazo: 1 } });
  });

  it("sem o 5º argumento, semPrazo é vazio (compatível com chamadas antigas)", () => {
    expect(montarEdicao([], "2026-10-06", cfg, "x").semPrazo).toEqual([]);
  });

  it("item com data herdada se comporta como item datado normal (pendência)", () => {
    const h = com({ data: "2026-10-05", dataHerdada: true });
    expect(ed([h], []).pendencias.map((p) => p.item.id)).toEqual([h.id]);
  });
});
