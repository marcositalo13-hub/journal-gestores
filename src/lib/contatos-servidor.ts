// Contatos (WhatsApp) dos gestores no Supabase, lidos e gravados NO SERVIDOR com a sessão do leitor
// (chave publicável + JWT do usuário). A service role nunca é usada. O valor do banco vence o do config.
import { cache } from "react";
import { getConfig, type JornalConfig, type Leitor } from "./config";
import { normalizarWhatsapp } from "./contatos";
import { slugDe } from "./edicao/caderno";
import { criarClienteServidor } from "./supabase/server";

/** O pedaço do cliente Supabase que usamos (permite testar sem rede). */
export interface ClienteContatos {
  from(tabela: string): {
    select(colunas: string): PromiseLike<{ data: { gestor_slug: string; whatsapp: string }[] | null; error: { code?: string; message: string } | null }>;
    upsert(linha: Record<string, unknown>): PromiseLike<{ error: { code?: string; message: string } | null }>;
  };
}

/** Do config: slug → número (só os que têm). */
function doConfig(cfg: JornalConfig): Record<string, string> {
  return Object.fromEntries(cfg.gestores.filter((g) => g.whatsapp).map((g) => [slugDe(g.nome), g.whatsapp as string]));
}

let avisouTabelaAusente = false;
const tabelaAusente = (e: { code?: string; message: string }) =>
  e.code === "42P01" || e.code === "PGRST205" || (/contatos_gestores/.test(e.message) && /(does not exist|schema cache)/i.test(e.message));

/** slug → número. O banco vence o config; sem a tabela (migração ainda não rodada) ou com qualquer erro, usa só o config. */
export async function lerContatos(supabase: ClienteContatos, cfg: JornalConfig = getConfig()): Promise<Record<string, string>> {
  const base = doConfig(cfg);
  try {
    const { data, error } = await supabase.from("contatos_gestores").select("gestor_slug, whatsapp");
    if (error) {
      if (tabelaAusente(error)) {
        if (!avisouTabelaAusente) {
          avisouTabelaAusente = true;
          console.error('[contatos] tabela "contatos_gestores" não existe; usando só o config. Rode a migração no SQL Editor do Supabase.');
        }
      } else console.error("[contatos] leitura indisponível:", error.message);
      return base;
    }
    for (const l of data ?? []) if (normalizarWhatsapp(l.whatsapp) === l.whatsapp) base[l.gestor_slug] = l.whatsapp;
  } catch (e) {
    console.error("[contatos] leitura indisponível:", e instanceof Error ? e.message : "erro desconhecido");
  }
  return base;
}

/** Contatos para as páginas atrás do login (uma leitura por requisição). */
export const obterContatos = cache(async (): Promise<Record<string, string>> => lerContatos((await criarClienteServidor()) as unknown as ClienteContatos));

export type ResultadoSalvar = { ok: true; numero: string } | { ok: false; erro: "nao_autorizado" | "gestor_desconhecido" | "invalido" | "falha" };

/** Regras de gravação: só leitor do config, gestor existente, número válido; upsert com o e-mail do leitor. */
export async function salvarContato(
  leitor: Leitor | null,
  supabase: ClienteContatos,
  slug: string,
  entrada: string,
  cfg: JornalConfig = getConfig(),
): Promise<ResultadoSalvar> {
  if (!leitor) return { ok: false, erro: "nao_autorizado" };
  if (!cfg.gestores.some((g) => slugDe(g.nome) === slug)) return { ok: false, erro: "gestor_desconhecido" };
  const numero = normalizarWhatsapp(typeof entrada === "string" ? entrada : "");
  if (!numero) return { ok: false, erro: "invalido" };
  try {
    const { error } = await supabase.from("contatos_gestores").upsert({ gestor_slug: slug, whatsapp: numero, atualizado_por: leitor.email, atualizado_em: new Date().toISOString() });
    if (error) {
      console.error("[contatos] não foi possível salvar:", error.message);
      return { ok: false, erro: "falha" };
    }
  } catch (e) {
    console.error("[contatos] não foi possível salvar:", e instanceof Error ? e.message : "erro desconhecido");
    return { ok: false, erro: "falha" };
  }
  return { ok: true, numero };
}
