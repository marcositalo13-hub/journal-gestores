// Gera o par de chaves VAPID e acrescenta ao .env.local (sem imprimir a chave privada).
// Nunca sobrescreve chaves que já existem. Rode só na sua máquina: npm run push:chaves
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as webpush from "web-push";

const ARQUIVO = join(process.cwd(), ".env.local");
const ASSUNTO = "mailto:marcos.porto@brbseguros.com.br";

const atual = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8") : "";
const tem = (nome: string) => new RegExp(`^\\s*${nome}\\s*=\\s*\\S`, "m").test(atual);

const jaTemPar = tem("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && tem("VAPID_PRIVATE_KEY");
const novas: string[] = [];

if (!jaTemPar) {
  if (tem("NEXT_PUBLIC_VAPID_PUBLIC_KEY") !== tem("VAPID_PRIVATE_KEY")) {
    // Só metade do par: gerar outro par quebraria a outra metade. Pare e deixe a decisão com você.
    console.error("Há só uma das chaves VAPID no .env.local. Remova a metade existente (ou complete o par) e rode de novo.");
    process.exit(1);
  }
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  novas.push(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`, `VAPID_PRIVATE_KEY=${privateKey}`);
}
if (!tem("VAPID_SUBJECT")) novas.push(`VAPID_SUBJECT=${ASSUNTO}`);

if (novas.length === 0) {
  console.log("As chaves VAPID já existem no .env.local; nada foi alterado.");
} else {
  const separador = atual === "" || atual.endsWith("\n") ? "" : "\n";
  appendFileSync(ARQUIVO, `${separador}${novas.join("\n")}\n`);
  console.log(`Acrescentado ao .env.local: ${novas.map((l) => l.split("=")[0]).join(", ")} (a chave privada não é exibida).`);
  console.log("No Vercel, adicione as mesmas variáveis (Settings → Environment Variables).");
}
