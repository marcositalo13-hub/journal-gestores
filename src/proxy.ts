import type { NextRequest } from "next/server";
import { atualizarSessao } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return atualizarSessao(request);
}

export const config = {
  // Públicos (fora do proxy): /api/cron/* (protegido pelo CRON_SECRET, nunca redireciona),
  // assets do Next, manifest, ícones e arquivos estáticos.
  matcher: [
    "/((?!api/cron/|_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)",
  ],
};
