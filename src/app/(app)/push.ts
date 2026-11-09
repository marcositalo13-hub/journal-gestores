"use server";

import { headers } from "next/headers";
import { leitorDaSessao } from "@/lib/auth";
import { salvarInscricaoCom, type ClienteInscricoes, type DadosInscricao, type ResultadoInscricao } from "@/lib/push/inscricao";
import { criarClienteServidor } from "@/lib/supabase/server";

/** Salva a inscrição de push deste aparelho para o leitor logado (sessão do usuário; nunca a service role). */
export async function salvarInscricao(dados: DadosInscricao): Promise<ResultadoInscricao> {
  const leitor = await leitorDaSessao();
  if (!leitor) return { ok: false, erro: "nao_autorizado" };
  const ua = (await headers()).get("user-agent");
  return salvarInscricaoCom(leitor, (await criarClienteServidor()) as unknown as ClienteInscricoes, dados, ua);
}
