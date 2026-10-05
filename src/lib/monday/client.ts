// Cliente monday.com: mondayQuery (somente leitura) e mondayMutation (restrita a config.quadros).
// Não usamos o pacote "server-only" porque os scripts rodam em Node puro.
import { getConfig } from "../config";

if (typeof window !== "undefined") {
  throw new Error("src/lib/monday/client.ts não pode ser importado no browser (o token vazaria).");
}

const ENDPOINT = "https://api.monday.com/v2";
// TODO: fixar o header API-Version (ex.: "2025-10") após validar o schema usado pelo coletor.

export interface MondayGraphQLError {
  message: string;
  extensions?: { code?: string; retry_in_seconds?: number; [k: string]: unknown };
  [k: string]: unknown;
}

export class MondayApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errors?: MondayGraphQLError[],
  ) {
    super(message);
    this.name = "MondayApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ehErroDeLimite(status: number, body: unknown): boolean {
  if (status === 429) return true;
  const texto = JSON.stringify(body ?? "").toLowerCase();
  return texto.includes("complexity") || texto.includes("rate_limit") || texto.includes("ratelimit");
}

function tempoDeEspera(res: Response, body: unknown): number {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const m = JSON.stringify(body ?? "").match(/"retry_in_seconds"\s*:\s*(\d+)|reset in (\d+) seconds?/i);
  const s = m ? Number(m[1] ?? m[2]) : NaN;
  return Number.isFinite(s) && s > 0 ? s : 10;
}

async function enviar(query: string, variables: Record<string, unknown> | undefined, token: string) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  let body: unknown = null;
  const texto = await res.text();
  try {
    body = texto ? JSON.parse(texto) : null;
  } catch {
    body = texto;
  }
  return { res, body };
}

const ehMutation = (query: string) => /^\s*mutation\b/i.test(query);

/** Executa uma query GraphQL de leitura. Repete uma vez em 429 / erro de complexidade. */
export async function mondayQuery<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (ehMutation(query)) throw new MondayApiError("mondayQuery é somente leitura: mutations não são permitidas.");
  return executar<T>(query, variables);
}

/** Coleta recursivamente os valores de chaves que casam com `re` (ex.: board_id, boardIds). */
function coletarIds(v: unknown, re: RegExp, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => coletarIds(x, re, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (re.test(k)) [x].flat().forEach((id) => out.push(String(id)));
      else coletarIds(x, re, out);
    }
  }
  return out;
}

function quadroPermitido(id: string): boolean {
  const cfg = getConfig();
  return cfg.quadros.some((q) => q.id === id) && !cfg.quadros_ignorados.includes(id);
}

/**
 * Executa uma mutation. Antes de enviar, exige que todo board_id nas variáveis esteja em
 * config.quadros (e fora de quadros_ignorados). Mutations sem board_id (ex.: move_item_to_group)
 * precisam de item_id, e o quadro de cada item é verificado por leitura antes do envio.
 */
export async function mondayMutation<T = unknown>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!ehMutation(query)) throw new MondayApiError("mondayMutation só aceita operações 'mutation'.");
  const boards = coletarIds(variables, /^board_?ids?$/i);
  const itens = coletarIds(variables, /^item_?ids?$/i);
  if (!boards.length && !itens.length) {
    throw new MondayApiError("mondayMutation: variáveis sem board_id/item_id; não é possível verificar o quadro alvo.");
  }
  for (const b of boards) {
    if (!quadroPermitido(b)) throw new MondayApiError(`mondayMutation bloqueada: quadro ${b} não está em config.quadros (ou está ignorado).`);
  }
  if (itens.length) {
    const r = await mondayQuery<{ items: { id: string; board: { id: string } | null }[] }>(
      `query ($ids: [ID!]) { items(ids: $ids) { id board { id } } }`,
      { ids: itens },
    );
    for (const id of itens) {
      const b = r.items.find((i) => i.id === id)?.board?.id;
      if (!b || !quadroPermitido(b)) throw new MondayApiError(`mondayMutation bloqueada: item ${id} pertence ao quadro ${b ?? "?"}, fora de config.quadros.`);
    }
  }
  return executar<T>(query, variables);
}

async function executar<T>(query: string, variables: Record<string, unknown> | undefined): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN?.trim();
  if (!token) throw new MondayApiError("MONDAY_API_TOKEN ausente. Defina-o em .env.local (veja .env.local.example).");

  for (let tentativa = 0; ; tentativa++) {
    const { res, body } = await enviar(query, variables, token);
    const b = (body ?? {}) as { data?: T; errors?: MondayGraphQLError[]; error_message?: string; error_code?: string };
    const temErro = !res.ok || (b.errors?.length ?? 0) > 0 || !!b.error_message;

    if (!temErro) return b.data as T;

    if (tentativa === 0 && ehErroDeLimite(res.status, body)) {
      const s = Math.min(tempoDeEspera(res, body), 60);
      console.warn(`[monday] limite atingido (HTTP ${res.status}); nova tentativa em ${s}s...`);
      await sleep(s * 1000);
      continue;
    }

    const msgs = b.errors?.map((e) => e.message) ?? [];
    if (b.error_message) msgs.push(`${b.error_code ?? ""} ${b.error_message}`.trim());
    if (!msgs.length) msgs.push(typeof body === "string" ? body.slice(0, 300) : res.statusText);
    throw new MondayApiError(`monday API (HTTP ${res.status}): ${msgs.join(" | ")}`, res.status, b.errors);
  }
}
