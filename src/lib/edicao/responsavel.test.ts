// Quem responde: coordenação → gestor nos Pagamentos, com fallback para o dono do quadro + aviso do coletor.
import { describe, expect, it } from "vitest";
import { normalizarQuadro, type ItemNormalizado, type QuadroLido, type Valor } from "../coletor/ler";
import { getConfig, gestorDaCoordenacao } from "../config";
import { donoDoItem, montarItensJornal, rotulosDaCoordenacao } from "./itens";

const cfg = getConfig();
const v = (p: Partial<Valor> = {}): Valor => ({ text: "", label: null, date: null, number: null, labels: null, ...p });
let n = 0;
function pag(coord: Valor | null, o: Partial<ItemNormalizado> = {}): ItemNormalizado {
  n++;
  return {
    id: `p${n}`,
    nome: `Pagamento ${n}`,
    url: "https://x.monday.com/1",
    updatedAt: "2026-10-05T10:00:00Z",
    grupo: { id: "g", titulo: "Outubro 2026" },
    noCadastro: false,
    valores: { "Valor (R$)": v({ number: 100, text: "100" }), ...(coord ? { Coordenação: coord } : {}) },
    data: "2026-10-10",
    status: "Previsto",
    recorrencia: null,
    chave: null,
    motivo: null,
    etapas: null,
    datasSubitens: [],
    ...o,
  };
}
const quadro = (tipo: QuadroLido["tipo"], itens: ItemNormalizado[]): QuadroLido => ({
  id: "100",
  nome: "Q",
  tipo,
  dono: "Solange Mata",
  hierarquia: undefined,
  hierarchyType: "multi_level",
  grupos: [],
  colunas: {},
  itens,
  avisos: [],
} as unknown as QuadroLido);
const coord = (r: string) => v({ labels: [r], text: r });

describe("gestorDaCoordenacao / rotulosDaCoordenacao", () => {
  it("mapeia cada coordenação do config", () => {
    expect(gestorDaCoordenacao(["Superintendência"], cfg)).toBe("Solange Mata");
    expect(gestorDaCoordenacao(["Adm. e Financeira"], cfg)).toBe("Keite Martins");
    expect(gestorDaCoordenacao(["Controladoria"], cfg)).toBe("João Silva");
    expect(gestorDaCoordenacao(["Contábil e Fiscal"], cfg)).toBe("Graziely Palma");
  });
  it("vazio, nulo ou desconhecido → null; usa o primeiro rótulo conhecido", () => {
    expect(gestorDaCoordenacao([], cfg)).toBeNull();
    expect(gestorDaCoordenacao(null, cfg)).toBeNull();
    expect(gestorDaCoordenacao(["Jurídico"], cfg)).toBeNull();
    expect(gestorDaCoordenacao(["Jurídico", "Controladoria"], cfg)).toBe("João Silva");
  });
  it("rótulos: usa labels; senão o texto separado por vírgula", () => {
    expect(rotulosDaCoordenacao(v({ labels: ["A", "B"] }))).toEqual(["A", "B"]);
    expect(rotulosDaCoordenacao(v({ text: "A, B" }))).toEqual(["A", "B"]);
    expect(rotulosDaCoordenacao(v({ text: "" }))).toEqual([]);
    expect(rotulosDaCoordenacao(null)).toEqual([]);
  });
});

describe("dono dos itens (montarItensJornal)", () => {
  it("Pagamentos: dono = gestor da coordenação (não o dono do quadro)", () => {
    const { itens } = montarItensJornal([
      quadro("pagamentos", [pag(coord("Adm. e Financeira"), { nome: "Aluguel" }), pag(coord("Controladoria"), { nome: "Multa" }), pag(coord("Superintendência"), { nome: "Super" })]),
    ]);
    expect(itens.map((i) => [i.nome, i.dono])).toEqual([
      ["Aluguel", "Keite Martins"],
      ["Multa", "João Silva"],
      ["Super", "Solange Mata"],
    ]);
  });

  it("sem coordenação ou coordenação desconhecida → dono do quadro", () => {
    const { itens } = montarItensJornal([quadro("pagamentos", [pag(null, { nome: "Sem coluna" }), pag(v({ text: "" }), { nome: "Vazia" }), pag(coord("Jurídico"), { nome: "Desconhecida" })])]);
    expect(itens.map((i) => i.dono)).toEqual(["Solange Mata", "Solange Mata", "Solange Mata"]);
  });

  it("atividades continuam com o dono do quadro, mesmo com coluna Coordenação", () => {
    const q = quadro("atividades", [pag(coord("Controladoria"))]);
    q.dono = "TESTE";
    expect(montarItensJornal([q]).itens[0].dono).toBe("TESTE");
  });

  it("donoDoItem é usado também para itens sem prazo", () => {
    const { semPrazo } = montarItensJornal([quadro("pagamentos", [pag(coord("Contábil e Fiscal"), { data: null })])]);
    expect(semPrazo[0].dono).toBe("Graziely Palma");
    expect(donoDoItem(pag(null), { tipo: "pagamentos", dono: "X" }, cfg)).toBe("X");
  });
});

// ---------- aviso do coletor ----------
const colunas = [
  { id: "c_fav", title: "Favorecido", type: "text" },
  { id: "c_val", title: "Valor (R$)", type: "numbers" },
  { id: "c_venc", title: "Vencimento", type: "date" },
  { id: "c_rec", title: "Recorrência", type: "dropdown" },
  { id: "c_st", title: "Status", type: "status" },
  { id: "c_coord", title: "Coordenação", type: "dropdown" },
  { id: "c_obs", title: "Observação", type: "text" },
  { id: "c_chave", title: "Chave", type: "text" },
];
const api = (id: string, coordTexto: string | null, grupo = "Outubro 2026") => ({
  id,
  name: `Item ${id}`,
  url: "https://x",
  updated_at: "2026-10-05T10:00:00Z",
  group: { id: "g", title: grupo },
  column_values: [
    { id: "c_venc", text: "2026-10-10", date: "2026-10-10" },
    { id: "c_val", text: "100", number: 100 },
    { id: "c_coord", text: coordTexto, values: coordTexto ? [{ label: coordTexto }] : [] },
    { id: "c_rec", text: "Não recorrente" },
    { id: "c_st", text: "Previsto", label: "Previsto" },
  ],
  subitems: [],
});
const avisos = (itens: ReturnType<typeof api>[], colunasUsadas = colunas) =>
  normalizarQuadro(
    { id: "100", tipo: "pagamentos", dono: "Solange Mata" },
    { id: "100", name: "Pagamentos", hierarchy_type: "multi_level", columns: colunasUsadas, groups: [{ id: "g", title: "Outubro 2026", position: "1" }], items_page: { cursor: null, items: [] } },
    itens,
    cfg,
  ).avisos.filter((a) => a.codigo === "pagamento_sem_coordenacao");

describe("aviso pagamento_sem_coordenacao (ler.ts)", () => {
  it("coordenação vazia → aviso com o id do item", () => {
    const a = avisos([api("1", null)]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ itemId: "1", quadroId: "100" });
    expect(a[0].mensagem).toContain("sem coordenação");
  });
  it("coordenação fora do config → aviso que cita o rótulo", () => {
    const a = avisos([api("2", "Jurídico")]);
    expect(a).toHaveLength(1);
    expect(a[0].mensagem).toContain("Jurídico");
  });
  it("coordenação conhecida → sem aviso; coluna ausente é reportada à parte (sem duplicar)", () => {
    expect(avisos([api("3", "Controladoria")])).toEqual([]);
    expect(avisos([api("4", null)], colunas.filter((c) => c.title !== "Coordenação"))).toEqual([]);
  });
  it("só vale para o quadro de Pagamentos", () => {
    const r = normalizarQuadro(
      { id: "200", tipo: "atividades", dono: "TESTE" },
      { id: "200", name: "Atividades", hierarchy_type: "multi_level", columns: [{ id: "c_prazo", title: "Prazo", type: "date" }], groups: [], items_page: { cursor: null, items: [] } },
      [],
      cfg,
    );
    expect(r.avisos.some((a) => a.codigo === "pagamento_sem_coordenacao")).toBe(false);
  });
});
