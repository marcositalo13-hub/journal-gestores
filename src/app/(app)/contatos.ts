"use server";

import { revalidatePath } from "next/cache";
import { leitorDaSessao } from "@/lib/auth";
import { salvarContato, type ClienteContatos, type ResultadoSalvar } from "@/lib/contatos-servidor";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Salva o WhatsApp de um gestor. Só leitores de config.leitores; usa a sessão do leitor (nunca a service role). */
export async function salvarWhatsapp(slug: string, entrada: string): Promise<ResultadoSalvar> {
  const leitor = await leitorDaSessao();
  if (!leitor) return { ok: false, erro: "nao_autorizado" };
  const r = await salvarContato(leitor, (await criarClienteServidor()) as unknown as ClienteContatos, slug, entrada);
  if (r.ok) revalidatePath("/", "layout"); // layout e caderno releem os contatos
  return r;
}
