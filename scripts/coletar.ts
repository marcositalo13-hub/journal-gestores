// Coletor. Padrão = dry-run (lê + valida + planeja, sem escrever).
// Com --aplicar: planeja, aplica no monday, relê e mostra o plano pós-aplicação.
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { executarColeta, type RelatorioQuadro } from "../src/lib/coletor/executar";
import type { QuadroLido } from "../src/lib/coletor/ler";
import type { PlanoQuadro } from "../src/lib/coletor/planejar";

function imprimirPlano(quadros: QuadroLido[], planos: PlanoQuadro[]) {
  for (const [i, q] of quadros.entries()) {
    const p = planos[i];
    const avisos = [...q.avisos, ...p.avisos];
    const cont = (t: string) => p.acoes.filter((a) => a.tipo === t).length;
    console.log(`\n■ ${q.nome} (${q.id}) · ${q.tipo} · dono ${q.dono} · ${q.hierarchyType ?? "?"}`);
    console.log(
      `  itens ${q.itens.length} (Cadastro ${q.itens.filter((x) => x.noCadastro).length}) · grupos ${q.grupos.map((g) => g.titulo).join(" › ")}\n` +
        `  existe ${cont("existe")} · seria_criada ${cont("seria_criada")} · seria_movido ${cont("seria_movido")} · avisos ${avisos.length}`,
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
}

function imprimirRelatorio(r: RelatorioQuadro) {
  console.log(`
▶ ${r.quadroNome} (${r.quadroId})`);
  for (const g of r.gruposCriados) console.log(`  + grupo     ${g.titulo} (${g.id})`);
  for (const g of r.gruposReordenados) console.log(`  ↕ grupo     ${g.titulo} → depois de ${g.depoisDe}`);
  for (const i of r.itensCriados) console.log(`  + item      ${i.nome} · ${i.data} · ${i.grupo} · ${i.chave} · id ${i.id}`);
  for (const i of r.itensMovidos) console.log(`  → movido    ${i.nome} (${i.id}) → ${i.grupo}`);
  for (const f of r.falhas) console.log(`  ✗ ${f.acao} · ${f.alvo} · ${f.erro}`);
  if (!r.gruposCriados.length && !r.gruposReordenados.length && !r.itensCriados.length && !r.itensMovidos.length && !r.falhas.length) {
    console.log("  (nada a fazer)");
  }
}

async function main() {
  loadEnvConfig(process.cwd(), undefined, { info: () => {}, error: console.error });
  const aplicar = process.argv.includes("--aplicar");
  const r = await executarColeta({ aplicar });

  console.log(`Jornal — coletor (${aplicar ? "APLICAR" : "dry-run"}) · hoje ${r.hoje} · janela ${r.janela.inicio} → ${r.janela.fim}`);
  if (r.avisoCalendario) console.log(`⚠ ${r.avisoCalendario}`);
  imprimirPlano(r.detalhe.antes.quadros, r.detalhe.antes.planos);

  if (aplicar && r.detalhe.depois) {
    console.log("\n=== Aplicando ===");
    r.quadros.forEach(imprimirRelatorio);
    console.log("\n=== Plano pós-aplicação ===");
    imprimirPlano(r.detalhe.depois.quadros, r.detalhe.depois.planos);
    if (r.totalFalhas) process.exitCode = 2;
  }

  const dir = join(process.cwd(), "tmp");
  mkdirSync(dir, { recursive: true });
  const arquivo = join(dir, aplicar ? "aplicar.json" : "dry-run.json");
  writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), ...r }, null, 2), "utf8");
  console.log(`
JSON completo: ${arquivo} (${r.durationMs} ms)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
