"use server";

import { redirect } from "next/navigation";
import { ehLeitor } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/server";

export interface EstadoEntrar {
  erro: string | null;
  email: string;
}

const ERRO_CREDENCIAIS = "E-mail ou senha incorretos";
const ERRO_NAO_AUTORIZADO = "Acesso não autorizado";

export async function entrar(_anterior: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");

  if (!email || !senha) return { erro: ERRO_CREDENCIAIS, email };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  // Mensagem genérica: nunca revela se o e-mail existe nem o motivo exato.
  if (error || !data.user) return { erro: ERRO_CREDENCIAIS, email };

  if (!ehLeitor(data.user.email)) {
    await supabase.auth.signOut({ scope: "local" });
    return { erro: ERRO_NAO_AUTORIZADO, email };
  }
  redirect("/");
}

export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/entrar");
}
