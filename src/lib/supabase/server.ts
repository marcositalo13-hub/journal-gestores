import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Crie um novo por requisição (o @supabase/ssr exige isso para os headers de cache).
 */
export async function criarClienteServidor() {
  const { url, chave } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, chave, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components não podem escrever cookies; o proxy renova a sessão a cada requisição.
        }
      },
    },
  });
}
