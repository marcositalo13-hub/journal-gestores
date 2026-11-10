"use server";

import { revalidatePath, updateTag } from "next/cache";
import { leitorDaSessao } from "@/lib/auth";
import { autorizar, depsMonday, desfazer, type ResultadoAutorizacao, type ResultadoDesfazer } from "@/lib/autorizacao";

/** Expira a leitura em cache do monday e as telas já renderizadas: tudo reflete a mudança na próxima renderização. */
function atualizarTelas() {
  updateTag("edicao");
  revalidatePath("/", "layout");
}

/** Autoriza um pagamento "Aguardando autorização" (leitor da sessão; relê o item no monday antes de gravar). */
export async function autorizarPagamento(itemId: string): Promise<ResultadoAutorizacao> {
  const r = await autorizar(String(itemId), depsMonday(await leitorDaSessao()));
  if (r.ok) atualizarTelas();
  return r;
}

/** Desfaz a autorização: só quem autorizou e só nos primeiros 10 minutos. */
export async function desfazerAutorizacao(itemId: string): Promise<ResultadoDesfazer> {
  const r = await desfazer(String(itemId), depsMonday(await leitorDaSessao()));
  if (r.ok) atualizarTelas();
  return r;
}
