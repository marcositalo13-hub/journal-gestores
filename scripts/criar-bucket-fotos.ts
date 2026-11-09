// Cria (ou confirma) o bucket PRIVADO "gestores". Roda SÓ na sua máquina, com a service role do .env.local.
// A service role nunca deve ir para o Vercel nem para o app.
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { BUCKET_FOTOS } from "../src/lib/fotos";

async function main() {
  loadEnvConfig(process.cwd(), undefined, { info: () => {}, error: console.error });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");

  const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const opcoes = { public: false, fileSizeLimit: 1_048_576, allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"] };

  const { data: existente } = await sb.storage.getBucket(BUCKET_FOTOS);
  if (!existente) {
    const { error } = await sb.storage.createBucket(BUCKET_FOTOS, opcoes);
    if (error) throw new Error(`Não foi possível criar o bucket: ${error.message}`);
    console.log(`Bucket "${BUCKET_FOTOS}" criado (privado).`);
  } else {
    const { error } = await sb.storage.updateBucket(BUCKET_FOTOS, opcoes);
    if (error) throw new Error(`Não foi possível atualizar o bucket: ${error.message}`);
    console.log(`Bucket "${BUCKET_FOTOS}" já existia; confirmado como privado.`);
  }

  const { data: conferido } = await sb.storage.getBucket(BUCKET_FOTOS);
  console.log(`  público: ${conferido?.public ? "SIM (erro!)" : "não"} · limite ${conferido?.file_size_limit ?? "?"} bytes`);
  console.log("\nFalta (uma vez): rodar supabase/migrations/20261110000000_bucket_gestores.sql no SQL Editor do Supabase,");
  console.log("que cria a policy de leitura para usuários autenticados.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
