// Coletor. Padrão = dry-run (lê + valida + planeja, sem escrever).
// Com --aplicar: planeja, aplica no monday, relê e mostra o plano pós-aplicação.
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { executarColeta, type RelatorioQuadro } from "../src/lib/coletor/executar";
import type { Aviso, QuadroLido } from "../src/lib/coletor/ler";
import type { PlanoQuadro } from "../src/lib/coletor/planejar";

function imprimirPlanoArea(q: QuadroLido, p: PlanoQuadro, avisos: Aviso[]) {
  const cont = (t: string) => p.acoesArea.filter((a) => a.tipo === t).length;
  const classes = (c: string) => q.itens.filter((i) => i.porArea?.classe === c).length;
  console.log(`\n■ ${q.nome} (${q.id}) · ${q.tipo} · por_area · ${q.hierarchyType ?? "?"}`);
  console.log(
    `  itens ${q.itens.length} (regras ${classes("regra")} · ocorrências ${classes("ocorrencia")} · únicos ${classes("unico")}) · grupos ${q.grupos.length}\n` +
      `  area_atualizada ${cont("area_atualizada")} · regra_rotulada ${cont("regra_rotulada")} · seria_criada ${cont("seria_criada")} · seria_finalizado ${cont("seria_finalizado")} · existe ${p.ocorrenciasExistentes} · avisos ${avisos.length}`,
  );
  for (const a of avisos) console.log(`  ⚠ [${a.codigo}] ${a.mensagem}`);
  for (const a of p.acoesArea) {
    if (a.tipo === "area_atualizada") console.log(`  • area_atualizada  ${a.itemNome} · ${a.areaAtual ?? "(vazia)"} → ${a.area}`);
    else if (a.tipo === "regra_rotulada") console.log(`  • regra_rotulada   ${a.itemNome} · ${a.statusAtual ?? "(vazio)"} → ${a.status}`);
    else if (a.tipo === "seria_criada") console.log(`  • seria_criada     ${a.itemNome} · ${a.ocorrencia.dataOriginal} · ${a.grupo.titulo} · ${a.ocorrencia.chave}`);
    else console.log(`  • seria_finalizado ${a.itemNome} · ${a.status} em ${a.data} → ${a.grupo.titulo}`);
  }
}

function imprimirPlanoLista(q: QuadroLido, p: PlanoQuadro, avisos: Aviso[]) {
  const fin = q.itens.filter((i) => i.lista?.finalizada).length;
  console.log(`
■ ${q.nome} (${q.id}) · ${q.tipo} · lista · ${q.hierarchyType ?? "?"}`);
  console.log(
    `  itens ${q.itens.length} (em "${q.grupoFinalizadas}" ${fin}) · grupos ${q.grupos.map((g) => g.titulo).join(" › ")}
` +
      `  seria_finalizado ${p.acoesArea.length} · avisos ${avisos.length}`,
  );
  for (const a of avisos) console.log(`  ⚠ [${a.codigo}] ${a.mensagem}`);
  for (const a of p.acoesArea) if (a.tipo === "seria_finalizado") console.log(`  • seria_finalizado ${a.itemNome} · ${a.status} em ${a.data} → ${a.grupo.titulo}`);
}

function imprimirPlano(quadros: QuadroLido[], planos: PlanoQuadro[]) {
  for (const [i, q] of quadros.entries()) {
    const p = planos[i];
    const avisos = [...q.avisos, ...p.avisos];
    const cont = (t: string) => p.acoes.filter((a) => a.tipo === t).length;
    if (q.layout === "por_area") {
      imprimirPlanoArea(q, p, avisos);
      continue;
    }
    if (q.layout === "lista") {
      imprimirPlanoLista(q, p, avisos);
      continue;
    }
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
  for (const a of r.areasAtualizadas) console.log(`  ≡ área      ${a.nome} → ${a.area}`);
  for (const a of r.regrasRotuladas) console.log(`  ≡ regra     ${a.nome} → ${a.status}`);
  for (const i of r.itensCriados) console.log(`  + item      ${i.nome} · ${i.data} · ${i.grupo} · ${i.chave} · id ${i.id}`);
  for (const i of r.itensMovidos) console.log(`  → movido    ${i.nome} (${i.id}) → ${i.grupo}`);
  for (const f of r.falhas) console.log(`  ✗ ${f.acao} · ${f.alvo} · ${f.erro}`);
  if (![r.gruposCriados, r.gruposReordenados, r.areasAtualizadas, r.regrasRotuladas, r.itensCriados, r.itensMovidos, r.falhas].some((l) => l.length)) {
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
