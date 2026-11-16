// Quadro de Atividades (por_area) de mentira, no formato da API, para os testes do coletor. Só testes.
import { getConfig } from "../config";
import { janelaPadrao } from "../recorrencia";
import { normalizarQuadro, type QuadroLido } from "./ler";
import { planejarQuadro, type AcaoArea } from "./planejar";

export const cfg = getConfig();
export const OPER = "Gerência de Operações e Suporte ao Cliente";
export const ADM = "Coordenação Administrativa e Financeira";
export const CTRL = "Coordenação de Controladoria";
export const FINAL = "Atividades finalizadas";

// Rótulos como no quadro real (IDs de verdade, nomes com prefixo numérico).
export const statusSettings = (labels: Record<string, string>) => JSON.stringify({ labels });
export const dropdownSettings = (labels: [number, string][]) => JSON.stringify({ labels: labels.map(([id, name]) => ({ id, name })) });
export const STATUS = { "0": "Em andamento", "1": "Concluído", "2": "Travado", "10": "Cancelado", "17": "Não iniciado", "105": "Regra recorrente" };
export const REC: [number, string][] = [[1, "1. Não recorrente"], [2, "2. Diária"], [3, "Semanal"], [4, "3. Quinzenal"], [5, "4. Mensal"], [6, "5. Anual"]];
export const AREAS: [number, string][] = cfg.gestores.map((g, i) => [i + 1, g.area]);
export const idArea = (nome: string) => AREAS.find(([, n]) => n === nome)![0];

export const colunasCom = (status: Record<string, string> = STATUS, rec: [number, string][] = REC, comAncora = true) => [
  { id: "rec", title: "Recorrência", type: "dropdown", settings_str: dropdownSettings(rec) },
  { id: "tipo", title: "Tipo", type: "status", settings_str: statusSettings({ "0": "Atividade", "1": "Entrega", "2": "Pagamento", "19": "Contrato" }) },
  { id: "obs", title: "Observação", type: "text" },
  { id: "prazo", title: "Prazo", type: "date" },
  { id: "st", title: "Status", type: "status", settings_str: statusSettings(status) },
  { id: "ch", title: "Chave", type: "text" },
  { id: "area", title: "Área", type: "dropdown", settings_str: dropdownSettings(AREAS) },
  ...(comAncora ? [{ id: "anc", title: "Âncora", type: "text" }] : []),
];
export const colunas = colunasCom();
export const grupos = [OPER, ADM, CTRL, FINAL].map((title, i) => ({ id: `g${i}`, title, position: String(i + 1) }));

export interface It {
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
  ancora?: string;
}
export const api = (o: It) => {
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
      { id: "anc", text: o.ancora ?? null },
    ],
    subitems: [],
  };
};
export const ler = (itens: It[], gs = grupos, cols = colunas): QuadroLido =>
  normalizarQuadro(
    { id: "18438464813", tipo: "atividades", layout: "por_area", dono: "Solange Mata" },
    { id: "18438464813", name: "Atividades", hierarchy_type: "multi_level", columns: cols, groups: gs, items_page: { cursor: null, items: [] } },
    itens.map(api),
    cfg,
  );
export const planoEm = (hoje: string) => (itens: It[], gs = grupos, cols = colunas) => planejarQuadro(ler(itens, gs, cols), janelaPadrao(hoje), cfg, hoje);
export const de = <T extends AcaoArea["tipo"]>(a: AcaoArea[], t: T) => a.filter((x): x is Extract<AcaoArea, { tipo: T }> => x.tipo === t);
