import { executarColeta, resumo } from "@/lib/coletor/executar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ erro: "CRON_SECRET não configurado no ambiente." }, 500);
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return json({ erro: "não autorizado" }, 401);

  try {
    const relatorio = resumo(await executarColeta({ aplicar: true }));
    for (const q of relatorio.quadros) {
      console.log(
        `[coletor] ${q.quadroNome} (${q.quadroId}) criados=${q.itensCriados.length} grupos=${q.gruposCriados.length} ` +
          `movidos=${q.itensMovidos.length} falhas=${q.falhas.length} avisos=${q.avisos.length} ` +
          `existe=${q.contagemDepois?.existe ?? q.contagem.existe}`,
      );
    }
    console.log(`[coletor] concluído em ${relatorio.durationMs}ms · falhas=${relatorio.totalFalhas}`);
    return json(relatorio, relatorio.totalFalhas > 0 ? 500 : 200);
  } catch (e) {
    // mensagens do cliente monday não incluem o token; ainda assim só repassamos a mensagem
    const erro = e instanceof Error ? e.message : "erro desconhecido";
    console.error(`[coletor] erro: ${erro}`);
    return json({ erro }, 500);
  }
}
