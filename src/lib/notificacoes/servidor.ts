// Ligações reais das notificações (Supabase com service role, push, monday). Só servidor.
import "server-only";
import { getConfig } from "../config";
import { obterEdicao } from "../edicao/obter";
import { enviarPush } from "../push/enviar";
import { clienteServico } from "../supabase/servico";
import type { Pendente } from "./agrupar";
import { relerItem } from "./monday-item";
import type { DepsNotificacoes, RepoFila } from "./orquestrar";

const TABELA = "notificacoes_fila";

export const repoSupabase = (): RepoFila => ({
  async inserir(ns) {
    if (!ns.length) return;
    // ON CONFLICT (chave_dedupe) DO NOTHING: o mesmo evento (ou um reenvio da monday) nunca duplica
    const { error } = await clienteServico().from(TABELA).upsert(ns, { onConflict: "chave_dedupe", ignoreDuplicates: true });
    if (error) throw new Error(`fila: não foi possível inserir (${error.message})`);
  },
  async pendentes({ desde, antes }) {
    let q = clienteServico().from(TABELA).select("id, prioridade, titulo, corpo, url, item_id, criado_em").is("enviado_em", null);
    if (desde) q = q.gte("criado_em", desde.toISOString());
    if (antes) q = q.lt("criado_em", antes.toISOString());
    const { data, error } = await q.order("criado_em", { ascending: true }).limit(500);
    if (error) throw new Error(`fila: não foi possível ler (${error.message})`);
    return (data ?? []) as Pendente[];
  },
  async ultimoEnvioNormal() {
    const { data, error } = await clienteServico()
      .from(TABELA)
      .select("enviado_em")
      .eq("prioridade", "normal")
      .not("enviado_em", "is", null)
      .order("enviado_em", { ascending: false })
      .limit(1);
    if (error) throw new Error(`fila: não foi possível ler (${error.message})`);
    const v = data?.[0]?.enviado_em as string | undefined;
    return v ? new Date(v) : null;
  },
  async reivindicar(ids, quando) {
    if (!ids.length) return [];
    const { data, error } = await clienteServico().from(TABELA).update({ enviado_em: quando.toISOString() }).in("id", ids).is("enviado_em", null).select("id");
    if (error) throw new Error(`fila: não foi possível marcar (${error.message})`);
    return (data ?? []).map((r) => String(r.id));
  },
});

export function depsReais(): DepsNotificacoes {
  const cfg = getConfig();
  return {
    repo: repoSupabase(),
    async enviarATodos(payload) {
      for (const l of cfg.leitores) {
        const r = await enviarPush(l.email, payload).catch((e: unknown) => {
          console.error(`[push] falha para um leitor: ${e instanceof Error ? e.message : "erro desconhecido"}`);
          return null;
        });
        if (r) console.log(`[push] enviados=${r.enviados} desativadas=${r.desativadas} falhas=${r.falhas}`);
      }
    },
    relerItem: (itemId, boardId) => relerItem(itemId, boardId, cfg),
    async contagens() {
      const e = await obterEdicao();
      return { hoje: e.hoje.filter((i) => i.categoria !== "concluido").length, atrasados: e.pendencias.length };
    },
    log: (l) => console.log(l),
  };
}
