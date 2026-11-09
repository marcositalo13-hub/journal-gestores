// Itens sem prazo: motivo e textos. Puro e sem imports (serve também ao cliente).
export type MotivoSemPrazo = "sem_prazo" | "regra_sem_data";

export const TEXTO_SEM_PRAZO = "Sem prazo";
export const TEXTO_REGRA_SEM_DATA = "Recorrência sem data inicial — não gera as cópias";

/** Texto do motivo: nas linhas da seção "Sem prazo", no rótulo de urgência e na folha de detalhes. */
export function textoSemPrazo(motivo: MotivoSemPrazo | undefined): string {
  return motivo === "regra_sem_data" ? TEXTO_REGRA_SEM_DATA : TEXTO_SEM_PRAZO;
}
