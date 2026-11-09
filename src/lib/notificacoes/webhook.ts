// Entrada do webhook da monday: token, handshake e filtro inicial. Puro (só node:crypto).
// O payload NUNCA é usado como verdade: dele só saem o id do item, o quadro e qual coluna mudou.
import { createHash, timingSafeEqual } from "node:crypto";
import type { JornalConfig } from "../config";

export interface EventoMonday {
  tipo: "create_pulse" | "update_column_value";
  boardId: string;
  itemId: string;
  /** só em update_column_value */
  columnId?: string;
}

export interface ResultadoWebhook {
  status: number;
  corpo: Record<string, unknown>;
  /** presente quando há trabalho a fazer (depois de responder) */
  evento?: EventoMonday;
  /** uma linha para o log */
  log?: string;
}

/** Comparação em tempo constante (hash dos dois lados: mesmo tamanho sempre). */
export function tokenConfere(recebido: string | null | undefined, segredo: string | null | undefined): boolean {
  if (!recebido || !segredo) return false;
  const h = (s: string) => createHash("sha256").update(s, "utf8").digest();
  return timingSafeEqual(h(recebido), h(segredo));
}

const TIPOS = new Set(["create_pulse", "update_column_value"]);
const ehId = (v: unknown) => (typeof v === "number" || typeof v === "string") && /^\d{1,20}$/.test(String(v));

export function tratarWebhook(corpoTexto: string, token: string | null, segredo: string | undefined, cfg: JornalConfig): ResultadoWebhook {
  if (!segredo) return { status: 503, corpo: { erro: "webhook não configurado" }, log: "[webhook] recusado: MONDAY_WEBHOOK_SECRET ausente" };
  if (!tokenConfere(token, segredo)) return { status: 401, corpo: { erro: "não autorizado" }, log: "[webhook] recusado: token inválido" };

  let corpo: Record<string, unknown>;
  try {
    corpo = JSON.parse(corpoTexto) as Record<string, unknown>;
  } catch {
    return { status: 400, corpo: { erro: "JSON inválido" }, log: "[webhook] recusado: corpo não é JSON" };
  }
  // Handshake da monday ao criar o webhook: devolver o mesmo challenge.
  if (typeof corpo?.challenge === "string") return { status: 200, corpo: { challenge: corpo.challenge }, log: "[webhook] handshake respondido" };

  const e = (corpo?.event ?? null) as Record<string, unknown> | null;
  const tipo = e?.type;
  if (!e || typeof tipo !== "string" || !TIPOS.has(tipo)) return { status: 200, corpo: { ok: true }, log: `[webhook] ignorado: evento ${String(tipo ?? "?")}` };
  if (!ehId(e.boardId) || !ehId(e.pulseId)) return { status: 200, corpo: { ok: true }, log: "[webhook] ignorado: evento sem ids válidos" };

  const boardId = String(e.boardId);
  const configurado = cfg.quadros.some((q) => q.id === boardId) && !cfg.quadros_ignorados.includes(boardId);
  if (!configurado) return { status: 200, corpo: { ok: true }, log: `[webhook] ignorado: quadro ${boardId} fora do config` };

  const evento: EventoMonday = { tipo: tipo as EventoMonday["tipo"], boardId, itemId: String(e.pulseId) };
  if (tipo === "update_column_value") {
    if (typeof e.columnId !== "string" || !e.columnId) return { status: 200, corpo: { ok: true }, log: "[webhook] ignorado: mudança sem coluna" };
    evento.columnId = e.columnId;
  }
  return { status: 200, corpo: { ok: true }, evento };
}
