// Migração única: modelo antigo de recorrência (regra + cópias futuras) → item único (estilo ClickUp).
// Padrão = dry-run (só lê e mostra o plano). Com --aplicar: cria a coluna Âncora se faltar, converte cada regra
// (Prazo/Status/Observação/Âncora) e ARQUIVA as ocorrências abertas (archive_item; nada é apagado). Depois relê o
// quadro e mostra o plano do coletor, que deve ficar sem ações de recorrência.
import { loadEnvConfig } from "@next/env";
import { COLUNA_ANCORA, getConfig } from "../src/lib/config";
import { valorMonday } from "../src/lib/coletor/aplicar";
import { lerQuadro, type ColunaMapeada, type QuadroLido } from "../src/lib/coletor/ler";
import { planejarMigracao, type PlanoMigracao } from "../src/lib/coletor/migracao";
import { planejarQuadro } from "../src/lib/coletor/planejar";
import { hoje } from "../src/lib/calendario";
import { janelaPadrao } from "../src/lib/recorrencia";
import { mondayMutation } from "../src/lib/monday/client";

const M_CRIAR_COLUNA = `
mutation ($board_id: ID!, $titulo: String!, $descricao: String) {
  create_column(board_id: $board_id, title: $titulo, column_type: text, description: $descricao) { id title type }
}`;
const M_ATUALIZAR = `
mutation ($board_id: ID!, $item_id: ID!, $valores: JSON!) {
  change_multiple_column_values(board_id: $board_id, item_id: $item_id, column_values: $valores) { id }
}`;
const M_ARQUIVAR = `
mutation ($item_id: ID!) {
  archive_item(item_id: $item_id) { id }
}`;

function imprimir(p: PlanoMigracao, q: QuadroLido) {
  console.log(`\n■ ${q.nome} (${q.id})`);
  console.log(`  coluna "${COLUNA_ANCORA}": ${p.criarColunaAncora ? "seria criada (texto)" : "já existe"}`);
  console.log(`\n  Convertidos em item único (${p.convertidos.length}):`);
  for (const c of p.convertidos) {
    const de = c.de ? ` (de "${c.de.nome}")` : " (sem ocorrência aberta)";
    const obs = c.observacao ? " · Observação copiada" : "";
    console.log(`  • ${c.nome} (${c.itemId}) · ${c.statusAntes ?? "(vazio)"} ${c.prazoAntes ?? "sem data"} → ${c.status} ${c.prazo ?? "sem data"}${de}${obs} · âncora ${c.ancora ?? "(vazia)"}`);
  }
  console.log(`\n  Arquivados (${p.arquivados.length}):`);
  for (const a of p.arquivados) console.log(`  • ${a.nome} (${a.id}) · Prazo ${a.data ?? "sem data"} · ${a.chave}`);
  console.log(`\n  Histórico mantido (${p.historico.length}):`);
  for (const h of p.historico) console.log(`  • ${h.nome} (${h.id}) · ${h.status} · ${h.grupo} · ${h.chave}`);
}

async function aplicar(p: PlanoMigracao, q: QuadroLido): Promise<number> {
  const cfg = getConfig();
  const t = cfg.tipos_de_quadro[q.tipo];
  const colunas: Record<string, ColunaMapeada | null> = { ...q.colunas };
  let falhas = 0;
  const falha = (o: string, e: unknown) => {
    falhas++;
    console.log(`  ✗ ${o}: ${e instanceof Error ? e.message : String(e)}`);
  };

  if (p.criarColunaAncora) {
    try {
      const r = await mondayMutation<{ create_column: { id: string; type: string } }>(M_CRIAR_COLUNA, {
        board_id: q.id,
        titulo: COLUNA_ANCORA,
        descricao: "Uso interno do app A Pauta (dia-base da recorrência). Não editar; pode ficar oculta.",
      });
      colunas[COLUNA_ANCORA] = { id: r.create_column.id, type: r.create_column.type, titulo: COLUNA_ANCORA };
      console.log(`  + coluna ${COLUNA_ANCORA} (${r.create_column.id})`);
    } catch (e) {
      falha(`create_column ${COLUNA_ANCORA}`, e);
      return falhas; // sem a âncora não converte nada
    }
  }

  for (const c of p.convertidos) {
    const valores: Record<string, unknown> = {};
    const set = (titulo: string, v: Parameters<typeof valorMonday>[1]) => {
      const col = colunas[titulo];
      if (col) valores[col.id] = valorMonday(col, v);
    };
    try {
      if (c.prazo) set(t.data, { date: c.prazo });
      set(t.status, { label: c.status });
      if (c.observacao) set(t.campo_motivo, { text: c.observacao });
      if (c.ancora) set(COLUNA_ANCORA, { text: c.ancora });
      await mondayMutation(M_ATUALIZAR, { board_id: q.id, item_id: c.itemId, valores: JSON.stringify(valores) });
      console.log(`  ↻ ${c.nome} → ${c.status} ${c.prazo ?? "sem data"}`);
    } catch (e) {
      falha(`converter ${c.nome}`, e);
      continue; // as ocorrências desta regra NÃO são arquivadas: nada se perde
    }
    for (const a of p.arquivados.filter((x) => x.regraId === c.itemId)) {
      try {
        await mondayMutation(M_ARQUIVAR, { item_id: a.id });
        console.log(`  ⌫ arquivado ${a.nome} (${a.id})`);
      } catch (e) {
        falha(`arquivar ${a.nome}`, e);
      }
    }
  }
  return falhas;
}

async function main() {
  loadEnvConfig(process.cwd(), undefined, { info: () => {}, error: console.error });
  const cfg = getConfig();
  const comAplicar = process.argv.includes("--aplicar");
  const qc = cfg.quadros.find((x) => x.layout === "por_area");
  if (!qc) throw new Error("nenhum quadro por_area no config");
  const q = await lerQuadro(qc, cfg);
  if (!q) throw new Error(`quadro ${qc.id} não encontrado`);

  const plano = planejarMigracao(q, cfg);
  console.log(`Migração de recorrências (${comAplicar ? "APLICAR" : "dry-run"}) · hoje ${hoje()}`);
  imprimir(plano, q);
  if (!comAplicar) return;

  console.log("\n=== Aplicando ===");
  const falhas = await aplicar(plano, q);
  console.log(`\nFalhas: ${falhas}`);

  const depois = await lerQuadro(qc, cfg);
  if (depois) {
    const ref = hoje();
    const p = planejarQuadro(depois, janelaPadrao(ref), cfg, ref);
    console.log(`\n=== Depois: plano do coletor (${depois.itens.length} itens) ===`);
    for (const a of p.acoesArea) console.log(`  • ${a.tipo} ${"itemNome" in a ? a.itemNome : "titulo" in a ? a.titulo : ""}`);
    if (!p.acoesArea.length) console.log("  (nada a fazer)");
    const restantes = planejarMigracao(depois, cfg);
    console.log(`  itens ainda com "Regra recorrente": ${restantes.convertidos.length}`);
  }
  if (falhas) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
