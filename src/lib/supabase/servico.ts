// Cliente Supabase com a SERVICE ROLE (ignora RLS). Só servidor: envio de push e fila de notificações,
// que rodam sem sessão de usuário (cron e webhook). Nunca importe isto em código cliente.
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

export function clienteServico(): SupabaseClient {
  if (cliente) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidos no servidor.");
  cliente = createClient(url.trim().replace(/\/+$/, ""), service.trim(), { auth: { persistSession: false, autoRefreshToken: false } });
  return cliente;
}
