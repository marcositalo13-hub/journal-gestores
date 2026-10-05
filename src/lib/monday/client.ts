// Cliente monday.com SOMENTE LEITURA: este módulo expõe apenas mondayQuery.
// Não usamos o pacote "server-only" porque os scripts rodam em Node puro.
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

/** Executa uma query GraphQL de leitura. Repete uma vez em 429 / erro de complexidade. */
export async function mondayQuery<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN?.trim();
  if (!token) throw new MondayApiError("MONDAY_API_TOKEN ausente. Defina-o em .env.local (veja .env.local.example).");
  if (/^\s*mutation\b/i.test(query)) throw new MondayApiError("mondayQuery é somente leitura: mutations não são permitidas.");

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
