import { after } from "next/server";
import { getConfig } from "@/lib/config";
import { processarEvento } from "@/lib/notificacoes/orquestrar";
import { depsReais } from "@/lib/notificacoes/servidor";
import { tratarWebhook } from "@/lib/notificacoes/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Webhook da monday (create_item e change_column_value). Público no proxy, protegido pelo ?token=
 * (MONDAY_WEBHOOK_SECRET, comparação em tempo constante). Responde 200 na hora; o trabalho (reler o item,
 * aplicar as regras, enfileirar e mandar as imediatas) roda depois da resposta.
 */
export async function POST(request: Request) {
  const cfg = getConfig();
  const token = new URL(request.url).searchParams.get("token");
  const r = tratarWebhook(await request.text(), token, process.env.MONDAY_WEBHOOK_SECRET, cfg);
  if (r.log) console.log(r.log);
  const evento = r.evento;
  if (evento) {
    after(async () => {
      try {
        await processarEvento(evento, new Date(), depsReais(), cfg);
      } catch (e) {
        console.error(`[webhook] item ${evento.itemId}: erro ${e instanceof Error ? e.message : "desconhecido"}`);
      }
    });
  }
  return Response.json(r.corpo, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
