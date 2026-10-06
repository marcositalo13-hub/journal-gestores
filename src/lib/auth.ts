import { leitorPorEmail, type Leitor } from "./config";
import { criarClienteServidor } from "./supabase/server";

/** Leitor autorizado da sessão atual (validando o JWT), ou null. Para Route Handlers e Server Components. */
export async function leitorDaSessao(): Promise<Leitor | null> {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  return leitorPorEmail(email);
}
