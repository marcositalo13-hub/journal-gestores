import { leitorDaSessao } from "@/lib/auth";
import { obterEdicao } from "@/lib/edicao/obter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(corpo: unknown, status: number) {
  return Response.json(corpo, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  // Verifica a sessão aqui também: não dependemos só do proxy.
  if (!(await leitorDaSessao())) return json({ erro: "não autorizado" }, 401);
  try {
    return json(await obterEdicao(), 200);
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : "Edição indisponível" }, 502);
  }
}
