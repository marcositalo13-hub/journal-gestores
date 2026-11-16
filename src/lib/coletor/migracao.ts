// Migração única do modelo antigo (regra "Regra recorrente" + cópias futuras) para o modelo de item único (estilo ClickUp).
// Puro: só planeja. A execução fica em scripts/migrar-recorrencias.ts (dry-run por padrão; --aplicar grava).
import type { DataISO } from "../calendario";
import { COLUNA_ANCORA, getConfig, type JornalConfig } from "../config";
import { mesmoRotulo } from "../rotulos";
import type { ItemNormalizado, QuadroLido } from "./ler";

/** Rótulo do modelo antigo que marcava o item-regra. O rótulo fica no monday; o app só não o usa mais. */
export const STATUS_REGRA_ANTIGO = "Regra recorrente";

export interface Convertido {
  itemId: string;
  nome: string;
  prazoAntes: DataISO | null;
  /** novo Prazo do item vivo; null = sem Prazo (só o Status muda) */
  prazo: DataISO | null;
  statusAntes: string | null;
  status: string;
  /** Observação a gravar (a da ocorrência atual, se preenchida); null = mantém a do item */
  observacao: string | null;
  /** ocorrência aberta mais antiga, de onde vêm Prazo/Status/Observação; null = não havia */
  de: { id: string; nome: string } | null;
  /** Âncora a gravar (= novo Prazo); null sem Prazo */
  ancora: DataISO | null;
}

export interface PlanoMigracao {
  quadroId: string;
  /** a coluna oculta "Âncora" precisa ser criada */
  criarColunaAncora: boolean;
  convertidos: Convertido[];
  /** ocorrências abertas que saem do quadro (archive_item, nunca delete) */
  arquivados: { id: string; nome: string; chave: string; data: DataISO | null; regraId: string }[];
  /** ocorrências concluídas/canceladas: ficam como histórico (já têm Chave; o coletor as finaliza normalmente) */
  historico: { id: string; nome: string; chave: string; status: string; grupo: string }[];
}

const porPrazo = (a: ItemNormalizado, b: ItemNormalizado) => (a.data ?? "9999-99-99").localeCompare(b.data ?? "9999-99-99") || a.id.localeCompare(b.id);

/**
 * Para cada item com Status "Regra recorrente": junta as ocorrências (Chave começando por `${id}:`, em qualquer grupo).
 * Concluídas/canceladas ficam como histórico. Entre as abertas, a de Prazo mais antigo é a "atual": Prazo, Status e
 * Observação (se preenchida) passam para o item, que vira o item vivo; todas as abertas são arquivadas. Sem abertas:
 * mantém o Prazo do item e Status inicial. A Âncora recebe o novo Prazo.
 */
export function planejarMigracao(q: QuadroLido, cfg: JornalConfig = getConfig()): PlanoMigracao {
  const t = cfg.tipos_de_quadro[q.tipo];
  const plano: PlanoMigracao = { quadroId: q.id, criarColunaAncora: !q.colunas[COLUNA_ANCORA], convertidos: [], arquivados: [], historico: [] };
  const regras = q.itens.filter((i) => mesmoRotulo(i.status, STATUS_REGRA_ANTIGO));
  for (const r of regras) {
    const ocorrencias = q.itens.filter((i) => i.id !== r.id && i.chave?.startsWith(`${r.id}:`));
    const encerrada = (i: ItemNormalizado) => mesmoRotulo(i.status, t.status_concluido) || mesmoRotulo(i.status, t.status_cancelado);
    for (const o of ocorrencias.filter(encerrada)) plano.historico.push({ id: o.id, nome: o.nome, chave: o.chave!, status: o.status!, grupo: o.grupo.titulo });
    const abertas = ocorrencias.filter((o) => !encerrada(o)).sort(porPrazo);
    const atual = abertas[0] ?? null;
    const prazo = atual ? (atual.data ?? r.data) : r.data;
    plano.convertidos.push({
      itemId: r.id,
      nome: r.nome,
      prazoAntes: r.data,
      prazo,
      statusAntes: r.status,
      status: atual?.status?.trim() || t.status_inicial,
      observacao: atual?.motivo?.trim() || null,
      de: atual ? { id: atual.id, nome: atual.nome } : null,
      ancora: prazo,
    });
    for (const o of abertas) plano.arquivados.push({ id: o.id, nome: o.nome, chave: o.chave!, data: o.data, regraId: r.id });
  }
  return plano;
}
