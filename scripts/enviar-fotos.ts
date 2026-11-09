// Envia as fotos de ./fotos-gestores/ para o bucket privado "gestores", já em 512×512 (recorte ancorado no topo; padrão "north", ajustável em fotos_recorte na config) WebP.
// Roda SÓ na sua máquina, com a service role do .env.local. Arquivos: {slug}.jpg|png|webp (ex.: joao-silva.jpg).
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { getConfig } from "../src/lib/config";
import { slugDe } from "../src/lib/edicao/caderno";
import { BUCKET_FOTOS, TAMANHO_FOTO, caminhoDaFoto, classificarArquivosDeFotos } from "../src/lib/fotos";

const posicao = (r: string) => (r === "attention" ? sharp.strategy.attention : r === "center" ? "centre" : "north");

async function main() {
  loadEnvConfig(process.cwd(), undefined, { info: () => {}, error: console.error });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");

  const pasta = join(process.cwd(), "fotos-gestores");
  if (!existsSync(pasta)) throw new Error(`Pasta não encontrada: ${pasta}`);

  const gestores = getConfig().gestores.map((g) => ({ nome: g.nome, slug: slugDe(g.nome) }));
  const { validos, ignorados } = classificarArquivosDeFotos(
    readdirSync(pasta).filter((a) => a !== "LEIA-ME.txt" && !a.startsWith(".")),
    gestores.map((g) => g.slug),
  );

  const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: bucket } = await sb.storage.getBucket(BUCKET_FOTOS);
  if (!bucket) throw new Error(`O bucket "${BUCKET_FOTOS}" não existe. Rode antes: npm run fotos:bucket`);

  const recortes = getConfig().fotos_recorte ?? {};
  let falhas = 0;
  for (const { arquivo, slug } of validos) {
    const recorte = recortes[slug] ?? "north";
    try {
      const webp = await sharp(readFileSync(join(pasta, arquivo)))
        .rotate() // respeita a orientação do EXIF (fotos de celular)
        .resize(TAMANHO_FOTO, TAMANHO_FOTO, { fit: "cover", position: posicao(recorte) })
        .webp({ quality: 85 })
        .toBuffer();
      const { error } = await sb.storage.from(BUCKET_FOTOS).upload(caminhoDaFoto(slug), webp, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
      if (error) throw new Error(error.message);
      console.log(`✓ ${arquivo} → ${caminhoDaFoto(slug)} (${Math.round(webp.length / 1024)} KB, recorte ${recorte})`);
    } catch (e) {
      falhas++;
      console.error(`✗ ${arquivo}: ${e instanceof Error ? e.message : e}`);
    }
  }
  for (const i of ignorados) console.warn(`⚠ ignorado ${i.arquivo}: ${i.motivo}`);
  if (validos.length === 0) console.log("Nenhuma foto válida encontrada em ./fotos-gestores/.");

  // Quem ainda não tem foto no bucket (inclui as que já estavam lá de envios anteriores)
  const { data: objetos, error } = await sb.storage.from(BUCKET_FOTOS).list("", { limit: 1000 });
  if (error) throw new Error(`Não foi possível listar o bucket: ${error.message}`);
  const noBucket = new Set((objetos ?? []).map((o) => o.name));
  const sem = gestores.filter((g) => !noBucket.has(caminhoDaFoto(g.slug)));
  console.log(`\nFotos no bucket: ${gestores.length - sem.length} de ${gestores.length} gestores.`);
  if (sem.length) {
    console.log("Ainda sem foto (o app mostra as iniciais):");
    for (const g of sem) console.log(`  - ${g.nome}  →  fotos-gestores/${g.slug}.jpg`);
  }
  if (falhas) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
