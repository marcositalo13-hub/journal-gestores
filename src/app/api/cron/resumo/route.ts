import { getConfig } from "@/lib/config";
import { resumoDaManha } from "@/lib/notificacoes/orquestrar";
import { depsReais } from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** 07:00 em São Paulo (10:00 UTC): "Bom dia" com as contagens e a fila da noite marcada como enviada. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ erro: "CRON_SECRET não configurado no ambiente." }, 500);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return json({ erro: "não autorizado" }, 401);
  try {
    return json(await resumoDaManha(new Date(), depsReais(), getConfig()), 200);
  } catch (e) {
    const erro = e instanceof Error ? e.message : "erro desconhecido";
    console.error(`[resumo] erro: ${erro}`);
    return json({ erro }, 500);
  }
}
