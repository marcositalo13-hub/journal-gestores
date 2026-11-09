// Registra os webhooks da monday (create_item e change_column_value) nos quadros do config,
// apontando para {PRODUCTION_URL}/api/monday/webhook?token={MONDAY_WEBHOOK_SECRET}.
// Idempotente: só cria o que falta. Rode DEPOIS do deploy em produção (a monday faz o handshake na criação)
// e com MONDAY_WEBHOOK_SECRET já configurado no Vercel com o MESMO valor do .env.local.
//
// Limitação da API: a lista de webhooks não informa a URL; um webhook do mesmo evento já existente
// no quadro conta como "já registrado".
import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getConfig } from "../src/lib/config";
import { mondayMutation, mondayQuery } from "../src/lib/monday/client";

const PRODUCTION_URL = "https://journal-gestores-eight.vercel.app";
const EVENTOS = ["create_item", "change_column_value"] as const;
const ARQUIVO = join(process.cwd(), ".env.local");

/** Garante MONDAY_WEBHOOK_SECRET no .env.local (gera 32 bytes hex se faltar, sem imprimir). */
function garantirSegredo(): string {
  const atual = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8") : "";
  const m = /^\s*MONDAY_WEBHOOK_SECRET\s*=\s*(\S+)\s*$/m.exec(atual);
  if (m) return m[1];
  const novo = randomBytes(32).toString("hex");
  appendFileSync(ARQUIVO, `${atual === "" || atual.endsWith("\n") ? "" : "\n"}MONDAY_WEBHOOK_SECRET=${novo}\n`);
  console.log("MONDAY_WEBHOOK_SECRET gerado e acrescentado ao .env.local (valor não exibido). Copie-o para o Vercel antes de continuar.");
  return novo;
}

async function main() {
  loadEnvConfig(process.cwd(), undefined, { info: () => {}, error: console.error });
  const segredo = garantirSegredo();
  const url = `${PRODUCTION_URL}/api/monday/webhook?token=${encodeURIComponent(segredo)}`;
  const urlMascarada = `${PRODUCTION_URL}/api/monday/webhook?token=***`;
  const cfg = getConfig();

  let falhas = 0;
  for (const q of cfg.quadros) {
    if (cfg.quadros_ignorados.includes(q.id)) continue;
    const { webhooks } = await mondayQuery<{ webhooks: { id: string; event: string }[] }>(`query ($b: ID!) { webhooks(board_id: $b) { id event } }`, { b: q.id });
    console.log(`\n■ ${q.tipo} (${q.id}): ${webhooks.length} webhook(s) existente(s)${webhooks.length ? `: ${webhooks.map((w) => `${w.event}#${w.id}`).join(", ")}` : ""}`);
    for (const ev of EVENTOS) {
      if (webhooks.some((w) => w.event === ev)) {
        console.log(`  = ${ev}: já registrado`);
        continue;
      }
      try {
        const r = await mondayMutation<{ create_webhook: { id: string } }>(
          `mutation ($board_id: ID!, $url: String!, $event: WebhookEventType!) { create_webhook(board_id: $board_id, url: $url, event: $event) { id } }`,
          { board_id: q.id, url, event: ev },
        );
        console.log(`  + ${ev}: criado #${r.create_webhook.id} → ${urlMascarada}`);
      } catch (e) {
        falhas++;
        // a mensagem de erro da monday não contém o token; ainda assim nunca imprimimos a URL completa
        console.error(`  ✗ ${ev}: ${(e instanceof Error ? e.message : String(e)).replaceAll(segredo, "***")}`);
      }
    }
  }
  if (falhas) {
    console.error(`\n${falhas} falha(s). O deploy está no ar e o MONDAY_WEBHOOK_SECRET do Vercel é igual ao do .env.local?`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
