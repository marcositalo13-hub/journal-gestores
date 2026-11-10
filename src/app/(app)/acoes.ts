"use server";

import { revalidatePath, updateTag } from "next/cache";
import { leitorDaSessao } from "@/lib/auth";

/** Expira o cache de 5 min da leitura do monday; a próxima renderização lê dados novos. */
export async function atualizarEdicao() {
  if (!(await leitorDaSessao())) throw new Error("não autorizado");
  updateTag("edicao"); // expira já: a leitura desta requisição vai ao monday, sem o cache de 300 s
  revalidatePath("/", "layout"); // e descarta o cache de rotas do cliente (o router.refresh seguinte traz tudo fresco)
}
