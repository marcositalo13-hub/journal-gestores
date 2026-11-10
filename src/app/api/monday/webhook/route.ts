import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { getConfig } from "@/lib/config";
import { tratarEProcessar } from "@/lib/notificacoes/orquestrar";
import { depsReais } from "@/lib/notificacoes/servidor";

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
  // Expira só a tag da edição (o cache normal de 300 s segue valendo nas leituras comuns); {expire: 0} = próxima leitura bloqueia e vem fresca.
  const invalidarEdicao = () => revalidateTag("edicao", { expire: 0 });
  const { resposta: r, trabalho } = tratarEProcessar(await request.text(), token, process.env.MONDAY_WEBHOOK_SECRET, cfg, new Date(), depsReais(), invalidarEdicao);
  if (r.log) console.log(r.log);
  if (trabalho) after(trabalho);
  return Response.json(r.corpo, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
