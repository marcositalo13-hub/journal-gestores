import { getConfig } from "@/lib/config";
import { enviarPendentes } from "@/lib/notificacoes/orquestrar";
import { depsReais } from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** A cada 5 min: fora da janela não faz nada; dentro, manda as imediatas e (a cada agrupar_minutos) as normais. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ erro: "CRON_SECRET não configurado no ambiente." }, 500);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return json({ erro: "não autorizado" }, 401);
  try {
    const r = await enviarPendentes(new Date(), depsReais(), getConfig());
    if (r.foraDaJanela) console.log("[notificar] fora da janela: nada a fazer");
    return json(r, 200);
  } catch (e) {
    const erro = e instanceof Error ? e.message : "erro desconhecido";
    console.error(`[notificar] erro: ${erro}`);
    return json({ erro }, 500);
  }
}
