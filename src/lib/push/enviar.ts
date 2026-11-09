// ENVIO de Web Push. Módulo SOMENTE de servidor: usa a service role (supabase/servico.ts) para ler/atualizar inscrições
// (o envio roda sem sessão de usuário, ex.: futuros webhooks). Nunca importe isto em código cliente.
import "server-only";
import { clienteServico } from "../supabase/servico";
import * as webpush from "web-push";
import { enviarParaEmail, type DepsEnvio, type ResultadoEnvio } from "./nucleo";

function depsReais(): DepsEnvio {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const assunto = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !assunto) throw new Error("Defina NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (npm run push:chaves).");
  webpush.setVapidDetails(assunto, pub, priv);
  const sb = clienteServico(); // service role: lê as inscrições de todos os aparelhos sem sessão de usuário
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
