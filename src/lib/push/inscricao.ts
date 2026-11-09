// Gravar a inscrição de push do leitor (com a SESSÃO dele; a RLS só deixa gravar o próprio e-mail).
import type { Leitor } from "../config";

export interface DadosInscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
}

type Erro = { code?: string; message: string } | null;

export interface ClienteInscricoes {
  from(tabela: string): {
    insert(linha: Record<string, unknown>): PromiseLike<{ error: Erro }>;
    delete(): { eq(coluna: string, valor: string): PromiseLike<{ error: Erro }> };
  };
}

export type ResultadoInscricao = { ok: true } | { ok: false; erro: "nao_autorizado" | "invalido" | "falha" };

const texto = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

export async function salvarInscricaoCom(leitor: Leitor | null, supabase: ClienteInscricoes, d: DadosInscricao, userAgent: string | null): Promise<ResultadoInscricao> {
  if (!leitor) return { ok: false, erro: "nao_autorizado" };
  if (!texto(d?.endpoint, 2048) || !d.endpoint.startsWith("https://") || !texto(d.p256dh, 256) || !texto(d.auth, 128)) return { ok: false, erro: "invalido" };
  const linha = { email: leitor.email, endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, user_agent: userAgent?.slice(0, 300) ?? null, ativo: true };
  try {
    let { error } = await supabase.from("push_inscricoes").insert(linha);
    if (error?.code === "23505") {
      // o aparelho já estava inscrito (ex.: reativou): troca a linha antiga pela nova (a RLS só deixa apagar a própria)
      await supabase.from("push_inscricoes").delete().eq("endpoint", d.endpoint);
      ({ error } = await supabase.from("push_inscricoes").insert(linha));
    }
    if (error) {
      console.error("[push] não foi possível salvar a inscrição:", error.message);
      return { ok: false, erro: "falha" };
    }
  } catch (e) {
    console.error("[push] não foi possível salvar a inscrição:", e instanceof Error ? e.message : "erro desconhecido");
    return { ok: false, erro: "falha" };
  }
  return { ok: true };
}
