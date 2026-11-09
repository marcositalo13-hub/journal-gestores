// Regras da rota POST /api/notificacoes/teste (testável sem Next).
import type { Leitor } from "../config";
import type { ResultadoEnvio } from "./nucleo";
import { montarPayload, NOTIFICACAO_TESTE } from "./payload";

export type EnviarAoEmail = (email: string, payload: string) => Promise<ResultadoEnvio>;

/** Só leitor logado; envia a notificação de teste aos aparelhos DELE. */
export async function tratarTeste(leitor: Leitor | null, enviar: EnviarAoEmail): Promise<{ status: number; corpo: Record<string, unknown> }> {
  if (!leitor) return { status: 401, corpo: { erro: "não autorizado" } };
  try {
    const r = await enviar(leitor.email, montarPayload(NOTIFICACAO_TESTE));
    return { status: 200, corpo: { ...r } };
  } catch (e) {
    console.error("[push] teste indisponível:", e instanceof Error ? e.message : "erro desconhecido");
    return { status: 502, corpo: { erro: "Não foi possível enviar agora." } };
  }
}
