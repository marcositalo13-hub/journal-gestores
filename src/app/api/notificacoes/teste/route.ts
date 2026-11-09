import { leitorDaSessao } from "@/lib/auth";
import { enviarPush } from "@/lib/push/enviar";
import { tratarTeste } from "@/lib/push/teste";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Envia "A Pauta / Notificações ativadas..." aos aparelhos do leitor logado. */
export async function POST() {
  // Verifica a sessão aqui também: não dependemos só do proxy.
  const { status, corpo } = await tratarTeste(await leitorDaSessao(), enviarPush);
  return Response.json(corpo, { status, headers: { "Cache-Control": "private, no-store" } });
}
