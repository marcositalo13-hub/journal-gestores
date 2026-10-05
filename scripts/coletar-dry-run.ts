// Dry-run do coletor: lê + valida + planeja. NÃO escreve nada no monday.
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { coberturaCalendario, hoje } from "../src/lib/calendario";
import { lerQuadros } from "../src/lib/coletor/ler";
import { planejarQuadro } from "../src/lib/coletor/planejar";
import { getConfig } from "../src/lib/config";
import { janelaPadrao } from "../src/lib/recorrencia";

async function main() {
  loadEnvConfig(process.cwd());
  const cfg = getConfig();
  const ref = hoje();
  const janela = janelaPadrao(ref);
  const avisoCalendario = coberturaCalendario(ref);

  console.log(`Jornal — coletor (dry-run) · hoje ${ref} · janela ${janela.inicio} → ${janela.fim}`);
  if (avisoCalendario) console.log(`⚠ ${avisoCalendario}`);

  const quadros = await lerQuadros(cfg);
  const planos = quadros.map((q) => planejarQuadro(q, janela, cfg));

  for (const [i, q] of quadros.entries()) {
    const p = planos[i];
    const avisos = [...q.avisos, ...p.avisos];
    const cont = (t: string) => p.acoes.filter((a) => a.tipo === t).length;
    console.log(`\n■ ${q.nome} (${q.id}) · ${q.tipo} · dono ${q.dono} · ${q.hierarchyType ?? "?"}`);
    console.log(
      `  itens ${q.itens.length} (Cadastro ${q.itens.filter((x) => x.noCadastro).length}) · grupos ${q.grupos.length} · ` +
        `existe ${cont("existe")} · seria_criada ${cont("seria_criada")} · seria_movido ${cont("seria_movido")} · avisos ${avisos.length}`,
    );
    for (const a of avisos) console.log(`  ⚠ [${a.codigo}] ${a.mensagem}`);
    for (const a of p.acoes) {
      const oc = a.ocorrencia;
      const datas = oc.dataEfetiva === oc.dataOriginal ? oc.dataOriginal : `${oc.dataOriginal} → efetiva ${oc.dataEfetiva}`;
      const aviso = oc.avisarEm ? ` · avisarEm ${oc.avisarEm}` : "";
      const grupo = a.grupoExiste ? oc.grupoMes : `${oc.grupoMes} (grupo_seria_criado)`;
      console.log(`  • ${a.tipo.padEnd(12)} ${a.itemNome} · ${datas}${aviso} · ${grupo} · ${oc.chave}`);
    }
    for (const x of p.ignorados) console.log(`  ∅ ignorado     ${x.itemNome} · ${x.motivo}`);
  }

  const dir = join(process.cwd(), "tmp");
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, "dry-run.json");
  writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), hoje: ref, janela, avisoCalendario, quadros, planos }, null, 2), "utf8");
  console.log(`\nJSON completo: ${arquivo}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
