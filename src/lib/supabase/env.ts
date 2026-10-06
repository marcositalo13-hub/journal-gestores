// Só a chave publicável (anon) é usada no app. A service role NÃO deve ser lida aqui.
// Acesso estático a process.env.NEXT_PUBLIC_* para o Next embutir os valores no bundle do browser.

/** Valida que a URL é só a origem do projeto (sem caminho, query ou fragmento). */
export function validarUrlSupabase(valor: string): string {
  const bruto = valor.trim();
  let u: URL;
  try {
    u = new URL(bruto);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL não é uma URL válida. Use o formato https://<projeto>.supabase.co`);
  }
  if (u.pathname.replace(/\/+$/, "") !== "" || u.search || u.hash) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL deve ser só a URL base do projeto (https://${u.host}), sem caminho. ` +
        `Recebido o caminho "${u.pathname}${u.search}${u.hash}"; remova-o (ex.: "/rest/v1/"). ` +
        `Com caminho, o login falha com 404 "Invalid path specified in request URL".`,
    );
  }
  return u.origin;
}

export function supabaseEnv(): { url: string; chave: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar definidos.");
  }
  return { url: validarUrlSupabase(url), chave: chave.trim() };
}
