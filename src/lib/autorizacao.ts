// Autorização de pagamentos pelo app: relê o item no monday, decide (regras puras) e grava numa única
// change_multiple_column_values pelo mondayMutation (lista de quadros permitidos). Só servidor: usa o token do monday.
import { ddmm, hoje as hojeSP } from "./calendario";
import { valorMonday } from "./coletor/aplicar";
import type { ColunaMapeada } from "./coletor/ler";
import { getConfig, grupoFinalizadasDoQuadro, type JornalConfig, type Leitor } from "./config";
import { mondayMutation, mondayQuery } from "./monday/client";
import { mesmoRotulo, parseRotulosDaColuna, resolverRotulo } from "./rotulos";

export const DESFAZER_MINUTOS = 10;
export const COLUNA_POR = "Autorizado por";
export const COLUNA_EM = "Autorizado em";

/** O pagamento como está AGORA no monday (nunca confiamos no que a tela tinha). */
export interface PagamentoLido {
  id: string;
  boardId: string;
  nome: string;
  status: string | null;
  /** quando a coluna Status mudou pela última vez (ISO); base da janela de "Desfazer" */
  statusAtualizadoEm: string | null;
  autorizadoPor: string | null;
  /** YYYY-MM-DD */
  autorizadoEm: string | null;
  colunas: { status: ColunaMapeada | null; por: ColunaMapeada | null; em: ColunaMapeada | null };
  /** grupos do quadro (para achar "Visualizados" e "Pagamentos" pelo título) */
  grupos?: { id: string; titulo: string }[];
}

export type ResultadoAutorizacao =
  | { ok: true; itemId: string; nome: string; autorizadoPor: string; autorizadoEm: string }
  | { ok: false; erro: string };
export type ResultadoDesfazer = { ok: true; itemId: string; nome: string } | { ok: false; erro: string };

type Plano = { ok: true; boardId: string; valores: Record<string, unknown> } | { ok: false; erro: string };

const falha = (erro: string) => ({ ok: false as const, erro });
export const MSG = {
  semLeitor: "Entre no app para autorizar pagamentos.",
  naoEhPagamento: "Este item não é um pagamento do quadro de Pagamentos.",
  cancelado: "Este pagamento foi cancelado no monday.",
  naoAutorizado: "Este pagamento não está autorizado.",
  prazoDesfazer: `Passaram os ${DESFAZER_MINUTOS} minutos para desfazer. Altere o Status direto no monday.`,
  semMonday: "Não foi possível consultar o monday. Nada foi alterado; tente de novo.",
  gravacao: "O monday não confirmou a gravação. Nada foi alterado; tente de novo.",
} as const;

export const idQuadroPagamentos = (cfg: JornalConfig) => cfg.quadros.find((q) => q.tipo === "pagamentos")?.id ?? null;

/** "Este pagamento já foi autorizado por Egídio em 10/11." (sem nome ou data, a frase encolhe) */
export function textoJaAutorizado(p: Pick<PagamentoLido, "autorizadoPor" | "autorizadoEm">): string {
  const por = p.autorizadoPor?.trim() ? ` por ${p.autorizadoPor.trim()}` : "";
  const em = p.autorizadoEm ? ` em ${ddmm(p.autorizadoEm)}` : "";
  return `Este pagamento já foi autorizado${por}${em}.`;
}

/** Colunas e rótulo exigidos; devolve a mensagem do que falta no quadro. */
function exigir(p: PagamentoLido, rotulo: string): { status: ColunaMapeada; por: ColunaMapeada; em: ColunaMapeada; index: number } | string {
  const { status, por, em } = p.colunas;
  if (!status) return `O quadro de Pagamentos não tem a coluna "Status".`;
  if (!por) return `O quadro de Pagamentos não tem a coluna "${COLUNA_POR}". Crie-a no monday.`;
  if (!em) return `O quadro de Pagamentos não tem a coluna "${COLUNA_EM}". Crie-a no monday.`;
  const r = resolverRotulo(status.rotulos, rotulo);
  if (!r) return `O rótulo "${rotulo}" não existe na coluna Status do monday.`;
  return { status, por, em, index: r.id };
}

/** Regras de "Autorizar": leitor; item do quadro de Pagamentos; Status exatamente "Aguardando autorização". */
export function planejarAutorizacao(p: PagamentoLido | null, leitor: Leitor | null, agora: Date, cfg: JornalConfig = getConfig()): Plano {
  if (!leitor) return falha(MSG.semLeitor);
  if (!p || p.boardId !== idQuadroPagamentos(cfg)) return falha(MSG.naoEhPagamento);
  const t = cfg.tipos_de_quadro.pagamentos;
  if (mesmoRotulo(p.status, t.status_concluido)) return falha(textoJaAutorizado(p));
  if (mesmoRotulo(p.status, t.status_cancelado)) return falha(MSG.cancelado);
  if (!mesmoRotulo(p.status, t.status_inicial)) return falha(`O Status deste pagamento no monday não é "${t.status_inicial}". Ajuste no monday e tente de novo.`);
  const c = exigir(p, t.status_concluido);
  if (typeof c === "string") return falha(c);
  return {
    ok: true,
    boardId: p.boardId,
    valores: {
      [c.status.id]: { index: c.index },
      [c.por.id]: valorMonday(c.por, { text: leitor.nome }),
      [c.em.id]: valorMonday(c.em, { date: hojeSP(agora, cfg) }),
    },
  };
}

/** Regras de "Desfazer": só quem autorizou, só até DESFAZER_MINUTOS depois da mudança de Status. */
export function planejarDesfazer(p: PagamentoLido | null, leitor: Leitor | null, agora: Date, cfg: JornalConfig = getConfig()): Plano {
  if (!leitor) return falha(MSG.semLeitor);
  if (!p || p.boardId !== idQuadroPagamentos(cfg)) return falha(MSG.naoEhPagamento);
  const t = cfg.tipos_de_quadro.pagamentos;
  if (!mesmoRotulo(p.status, t.status_concluido)) return falha(MSG.naoAutorizado);
  const quem = p.autorizadoPor?.trim() ?? "";
  if (quem !== leitor.nome.trim()) return falha(quem ? `Só ${quem} pode desfazer esta autorização.` : "Só quem autorizou pode desfazer esta autorização.");
  const quando = Date.parse(p.statusAtualizadoEm ?? "");
  const decorrido = agora.getTime() - quando;
  if (!Number.isFinite(quando) || decorrido > DESFAZER_MINUTOS * 60_000 || decorrido < -60_000) return falha(MSG.prazoDesfazer);
  const c = exigir(p, t.status_inicial);
  if (typeof c === "string") return falha(c);
  return { ok: true, boardId: p.boardId, valores: { [c.status.id]: { index: c.index }, [c.por.id]: "", [c.em.id]: null } };
}

export interface DepsAutorizacao {
  leitor: Leitor | null;
  agora: Date;
  ler(itemId: string): Promise<PagamentoLido | null>;
  gravar(boardId: string, itemId: string, valores: Record<string, unknown>): Promise<void>;
  /** move o item de grupo; opcional (sem ele, o coletor cuida da mudança depois) */
  mover?(itemId: string, grupoId: string): Promise<void>;
  cfg?: JornalConfig;
  log?(linha: string): void;
}

async function executar(itemId: string, deps: DepsAutorizacao, planejar: typeof planejarAutorizacao) {
  if (!deps.leitor) return { plano: falha(MSG.semLeitor), p: null };
  if (!/^\d{1,20}$/.test(itemId)) return { plano: falha(MSG.naoEhPagamento), p: null };
  let p: PagamentoLido | null;
  try {
    p = await deps.ler(itemId);
  } catch (e) {
    deps.log?.(`[autorizacao] leitura de ${itemId} falhou: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    return { plano: falha(MSG.semMonday), p: null };
  }
  const plano = planejar(p, deps.leitor, deps.agora, deps.cfg ?? getConfig());
  if (!plano.ok) return { plano, p };
  try {
    await deps.gravar(plano.boardId, itemId, plano.valores);
  } catch (e) {
    deps.log?.(`[autorizacao] gravação de ${itemId} falhou: ${e instanceof Error ? e.message : "erro desconhecido"}`);
    return { plano: falha(MSG.gravacao), p };
  }
  return { plano, p };
}

/**
 * Move o item para o grupo (achado pelo título) DEPOIS da gravação das colunas. Falhar aqui nunca desfaz nem reprova a
 * operação: as colunas já valem; o que ficar fora do lugar o coletor acerta na próxima rodada (autorizados) ou o
 * Status manda (desfeitos). Só loga.
 */
async function moverDepois(p: PagamentoLido, itemId: string, qual: "finalizadas" | "abertos", deps: DepsAutorizacao) {
  const cfg = deps.cfg ?? getConfig();
  const qc = cfg.quadros.find((q) => q.id === p.boardId);
  const titulo = qc ? (qual === "finalizadas" ? grupoFinalizadasDoQuadro(qc, cfg) : qc.grupo_abertos) : undefined;
  if (!titulo || !deps.mover) return;
  const grupo = p.grupos?.find((g) => g.titulo.trim() === titulo.trim());
  if (!grupo) {
    deps.log?.(`[autorizacao] ${itemId}: grupo "${titulo}" não existe no quadro; item não movido`);
    return;
  }
  try {
    await deps.mover(itemId, grupo.id);
  } catch (e) {
    deps.log?.(`[autorizacao] ${itemId}: não foi possível mover para "${titulo}" (${e instanceof Error ? e.message : "erro desconhecido"}); o coletor acerta depois`);
  }
}

export async function autorizar(itemId: string, deps: DepsAutorizacao): Promise<ResultadoAutorizacao> {
  const { plano, p } = await executar(itemId, deps, planejarAutorizacao);
  if (!plano.ok) return plano;
  await moverDepois(p!, itemId, "finalizadas", deps);
  return { ok: true, itemId, nome: p!.nome, autorizadoPor: deps.leitor!.nome, autorizadoEm: hojeSP(deps.agora, deps.cfg ?? getConfig()) };
}

export async function desfazer(itemId: string, deps: DepsAutorizacao): Promise<ResultadoDesfazer> {
  const { plano, p } = await executar(itemId, deps, planejarDesfazer);
  if (!plano.ok) return plano;
  await moverDepois(p!, itemId, "abertos", deps);
  return { ok: true, itemId, nome: p!.nome };
}

// ---------- monday de verdade ----------

const Q_ITEM = `
query ($ids: [ID!]) {
  items(ids: $ids) {
    id name
    board { id columns { id title type settings_str } groups { id title } }
    column_values { id text ... on StatusValue { label updated_at } ... on DateValue { date } }
  }
}`;

const M_MOVER = `
mutation ($item_id: ID!, $group_id: String!) {
  move_item_to_group(item_id: $item_id, group_id: $group_id) { id }
}`;

const M_GRAVAR = `
mutation ($board_id: ID!, $item_id: ID!, $valores: JSON!) {
  change_multiple_column_values(board_id: $board_id, item_id: $item_id, column_values: $valores) { id }
}`;

interface ItemApiAutorizacao {
  id: string;
  name: string;
  board: { id: string; columns: { id: string; title: string; type: string; settings_str?: string | null }[]; groups?: { id: string; title: string }[] } | null;
  column_values: { id: string; text: string | null; label?: string | null; updated_at?: string | null; date?: string | null }[];
}

/** Normaliza a resposta da API (colunas achadas pelo TÍTULO, como no coletor). Exportada para teste. */
export function lerPagamentoDaApi(it: ItemApiAutorizacao | undefined, cfg: JornalConfig = getConfig()): PagamentoLido | null {
  if (!it?.board) return null;
  const t = cfg.tipos_de_quadro.pagamentos;
  const col = (titulo: string): ColunaMapeada | null => {
    const c = it.board!.columns.find((x) => x.title.trim() === titulo);
    return c ? { id: c.id, type: c.type, titulo, rotulos: parseRotulosDaColuna(c.type, c.settings_str) } : null;
  };
  const colunas = { status: col(t.status), por: col(COLUNA_POR), em: col(COLUNA_EM) };
  const valor = (c: ColunaMapeada | null) => (c ? it.column_values.find((v) => v.id === c.id) : undefined);
  const st = valor(colunas.status);
  const por = valor(colunas.por)?.text?.trim();
  const em = valor(colunas.em);
  return {
    id: it.id,
    boardId: it.board.id,
    nome: it.name,
    status: st?.label ?? (st?.text?.trim() || null),
    statusAtualizadoEm: st?.updated_at ?? null,
    autorizadoPor: por || null,
    autorizadoEm: em?.date ?? (em?.text ? em.text.slice(0, 10) : null),
    colunas,
    grupos: (it.board.groups ?? []).map((g) => ({ id: g.id, titulo: g.title })),
  };
}

export function depsMonday(leitor: Leitor | null, agora: Date = new Date()): DepsAutorizacao {
  return {
    leitor,
    agora,
    ler: async (itemId) => lerPagamentoDaApi((await mondayQuery<{ items: ItemApiAutorizacao[] }>(Q_ITEM, { ids: [itemId] })).items?.[0]),
    gravar: async (boardId, itemId, valores) => {
      await mondayMutation(M_GRAVAR, { board_id: boardId, item_id: itemId, valores: JSON.stringify(valores) });
    },
    mover: async (itemId, grupoId) => {
      await mondayMutation(M_MOVER, { item_id: itemId, group_id: grupoId });
    },
    log: (l) => console.error(l),
  };
}
