import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ehLeitor } from "../config";
import { supabaseEnv } from "./env";

const PAGINA_ENTRAR = "/entrar";

/** Redireciona preservando os cookies/headers que o Supabase escreveu na resposta. */
function redirecionar(request: NextRequest, base: NextResponse, destino: string) {
  const url = request.nextUrl.clone();
  const [pathname, query] = destino.split("?");
  url.pathname = pathname;
  url.search = query ? `?${query}` : "";
  const r = NextResponse.redirect(url);
  base.cookies.getAll().forEach((c) => r.cookies.set(c));
  base.headers.forEach((v, k) => {
    if (k.toLowerCase() !== "location") r.headers.set(k, v);
  });
  r.headers.set("Cache-Control", "private, no-store");
  return r;
}

/**
 * Renova a sessão a cada requisição e aplica as regras de acesso:
 * sem sessão → /entrar; e-mail fora de config.leitores → sai e vai para /entrar?erro=nao-autorizado.
 */
export async function atualizarSessao(request: NextRequest) {
  const { url, chave } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, chave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // getClaims() valida o JWT; chamar antes de qualquer outra lógica (renova o token se preciso).
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  const naEntrada = request.nextUrl.pathname === PAGINA_ENTRAR;

  if (!email) {
    return naEntrada ? response : redirecionar(request, response, PAGINA_ENTRAR);
  }
  if (!ehLeitor(email)) {
    await supabase.auth.signOut({ scope: "local" });
    return redirecionar(request, response, `${PAGINA_ENTRAR}?erro=nao-autorizado`);
  }
  if (naEntrada) return redirecionar(request, response, "/");
  return response;
}
