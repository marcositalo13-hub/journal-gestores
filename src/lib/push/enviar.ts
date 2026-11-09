// ENVIO de Web Push. Módulo SOMENTE de servidor: usa a service role para ler/atualizar inscrições
// (o envio roda sem sessão de usuário, ex.: futuros webhooks). Nunca importe isto em código cliente.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import * as webpush from "web-push";
import { enviarParaEmail, type DepsEnvio, type ResultadoEnvio } from "./nucleo";

function depsReais(): DepsEnvio {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const assunto = process.env.VAPID_SUBJECT;
  if (!url || !service) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidos no servidor.");
  if (!pub || !priv || !assunto) throw new Error("Defina NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (npm run push:chaves).");
  webpush.setVapidDetails(assunto, pub, priv);
  const sb = createClient(url.trim().replace(/\/+$/, ""), service.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async listar(email) {
      const { data, error } = await sb.from("push_inscricoes").select("id, endpoint, p256dh, auth").eq("email", email).eq("ativo", true);
      if (error) throw new Error(`não foi possível ler as inscrições: ${error.message}`);
      return data ?? [];
    },
    async enviar(i, payload) {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, payload, { TTL: 60 * 60 });
    },
    async desativar(id) {
      await sb.from("push_inscricoes").update({ ativo: false }).eq("id", id);
    },
    async marcarEnvio(id) {
      await sb.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString() }).eq("id", id);
    },
  };
}

/** Envia o payload (JSON de montarPayload) a todos os aparelhos ativos do e-mail. */
export function enviarPush(email: string, payload: string): Promise<ResultadoEnvio> {
  return enviarParaEmail(email, payload, depsReais());
}
