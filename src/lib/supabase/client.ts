import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** Cliente Supabase para Client Components (lê/escreve cookies via document.cookie). */
export function criarClienteBrowser() {
  const { url, chave } = supabaseEnv();
  return createBrowserClient(url, chave);
}
