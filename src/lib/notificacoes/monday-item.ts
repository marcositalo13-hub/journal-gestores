// Relê UM item do monday (nunca confiamos no payload do webhook) e normaliza com o código do coletor/edição.
// Só servidor: usa o token do monday.
import { ITEM_FIELDS, normalizarQuadro, type ColunaApi, type ItemApi, type QuadroApi } from "../coletor/ler";
import { getConfig, type JornalConfig } from "../config";
import { montarItensJornal, type ItemEdicao } from "../edicao/itens";
import { mondayQuery } from "../monday/client";
import type { ItemRelido } from "./orquestrar";

const Q = `
query ($item: [ID!], $board: [ID!]) {
  items(ids: $item) { ${ITEM_FIELDS} board { id } }
  boards(ids: $board) { id name hierarchy_type columns { id title type settings_str capabilities { calculated { function } } } groups { id title position } }
}`;

type ItemComQuadro = ItemApi & { board: { id: string } | null };

/** Lê o item e o quadro dele; null se não existir, se o quadro não bater ou se o quadro não estiver no config. */
async function ler(itemId: string, boardId: string, cfg: JornalConfig) {
  if (!/^\d{1,20}$/.test(itemId) || !/^\d{1,20}$/.test(boardId)) return null;
  const qc = cfg.quadros.find((q) => q.id === boardId);
  if (!qc || cfg.quadros_ignorados.includes(boardId)) return null;
  const r = await mondayQuery<{ items: ItemComQuadro[]; boards: Omit<QuadroApi, "items_page">[] }>(Q, { item: [itemId], board: [boardId] });
  const it = r.items?.[0];
  const quadro = r.boards?.[0];
  if (!it || !quadro || it.board?.id !== boardId) return null;
  const lido = normalizarQuadro(qc, { ...quadro, items_page: { cursor: null, items: [] } }, [it], cfg);
  return { qc, quadro, lido, colunas: quadro.columns as ColunaApi[] };
}

export async function relerItem(itemId: string, boardId: string, cfg: JornalConfig = getConfig()): Promise<ItemRelido | null> {
  const r = await ler(itemId, boardId, cfg);
  if (!r) return null;
  const n = r.lido.itens[0];
  const { itens, semPrazo } = montarItensJornal([r.lido], cfg);
  const j = itens[0] ?? semPrazo[0] ?? null;
  return {
    tipoQuadro: r.qc.tipo,
    tituloDaColuna: (id) => r.colunas.find((c) => c.id === id)?.title.trim() ?? null,
    item:
      j && n
        ? {
            id: j.id,
            nome: j.nome,
            tipoQuadro: j.tipoQuadro,
            tipo: j.tipo,
            categoria: j.categoria,
            data: j.data,
            criadoEm: n.createdAt,
            geradoPeloColetor: !!n.chave?.trim(),
            finalizada: !!n.porArea?.finalizada,
            dono: j.dono,
            ...(j.coordenacao ? { coordenacao: j.coordenacao } : {}),
            ...(typeof j.valor === "number" ? { valor: j.valor } : {}),
          }
        : null,
  };
}

/** Item pronto para a folha de detalhes (abrir pela notificação), procurando em todos os quadros do config. */
export async function buscarItemEdicao(itemId: string, cfg: JornalConfig = getConfig()): Promise<ItemEdicao | null> {
  if (!/^\d{1,20}$/.test(itemId)) return null;
  const r = await mondayQuery<{ items: { id: string; board: { id: string } | null }[] }>(`query ($ids: [ID!]) { items(ids: $ids) { id board { id } } }`, { ids: [itemId] });
  const boardId = r.items?.[0]?.board?.id;
  if (!boardId) return null;
  const l = await ler(itemId, boardId, cfg);
  if (!l) return null;
  const { itens, semPrazo } = montarItensJornal([l.lido], cfg);
  return itens[0] ?? semPrazo[0] ?? null;
}
