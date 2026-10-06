"use server";

import { updateTag } from "next/cache";
import { leitorDaSessao } from "@/lib/auth";

/** Expira o cache de 5 min da leitura do monday; a próxima renderização lê dados novos. */
export async function atualizarEdicao() {
  if (!(await leitorDaSessao())) throw new Error("não autorizado");
  updateTag("edicao");
}
