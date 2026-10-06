// Imprime a edição de hoje com dados ao vivo do monday (somente leitura; sem o cache do Next).
import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hoje } from "../src/lib/calendario";
import { lerQuadros } from "../src/lib/coletor/ler";
import { getConfig } from "../src/lib/config";
import { montarItensJornal, type ItemEdicao } from "../src/lib/edicao/itens";
import { montarEdicao } from "../src/lib/edicao/montar";

const lin = (i: ItemEdicao) =>
  `${i.nome} · ${i.data ?? "SEM PRAZO"}${"dataHerdada" in i && i.dataHerdada ? " (herdada dos subitens)" : ""} · ${i.tipo} · ${i.categoria}${i.valor ? ` · R$ ${i.valor}` : ""}${i.etapas ? ` · etapas ${i.etapas.concluidas}/${i.etapas.total}` : ""} · ${i.dono}`;

async function main() {
  loadEnvConfig(process.cwd(), undefined, { info: () => {}, error: console.error });
  const cfg = getConfig();
  const data = process.argv[2] ?? hoje(); // opcional: node scripts/edicao-hoje.ts 2026-10-09
  const quadros = await lerQuadros(cfg);
  const { itens, semPrazo } = montarItensJornal(quadros, cfg);
  const e = montarEdicao(itens, data, cfg, new Date().toISOString(), semPrazo);

  console.log(`Edição de ${e.data} · ${itens.length} itens (+ ${semPrazo.length} sem prazo) · gerada ${e.geradoEm}`);
  console.log(`\nMANCHETE: ${e.manchete ? `[${e.manchete.regra}] ${e.manchete.item.nome} — ${e.manchete.motivo}` : "(nenhuma)"}`);
  console.log(`\nHOJE (${e.hoje.length})`);
  e.hoje.forEach((i) => console.log(`  • ${lin(i)}`));
  console.log(`\nPENDÊNCIAS (${e.pendencias.length})`);
  e.pendencias.forEach((p) => console.log(`  • ${lin(p.item)} · ${p.diasAtraso} dia(s) de atraso`));
  console.log(`\nTRAVADOS (${e.travados.length})`);
  e.travados.forEach((t) => console.log(`  • ${lin(t.item)} · motivo: ${t.motivo ?? "(sem)"} · diasTravado ${t.diasTravado}`));
  console.log(`\nSEM PRAZO (${e.semPrazo.length})`);
  e.semPrazo.forEach((i) => console.log(`  • ${lin(i)}`));
  console.log(`\nAVISO DIA NÃO ÚTIL: ${e.avisoNaoUtil ? `próximo dia útil ${e.avisoNaoUtil.proximoDiaUtil}` : "null"}`);
  e.avisoNaoUtil?.itens.forEach((x) => console.log(`  • ${x.rotulo} — ${lin(x.item)}`));
  console.log(`\nSEMANA`);
  e.semana.forEach((d) => {
    console.log(`  ${d.rotulo}${d.ehDiaUtil ? "" : " (não útil)"}${d.itens.length ? "" : " —"}`);
    d.itens.forEach((i) => console.log(`      • ${lin(i)}`));
  });
  console.log(`\nGESTORES`);
  e.gestores.forEach((g) =>
    console.log(`  ${g.nome.padEnd(18)} hoje ${g.contagens.hoje} · atrasados ${g.contagens.atrasados} · travados ${g.contagens.travados} · sem prazo ${g.contagens.semPrazo} · mês ${g.mes.concluidos}/${g.mes.total}${g.area ? "" : "  (fora do config)"}`),
  );

  const dir = join(process.cwd(), "tmp");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "edicao-hoje.json"), JSON.stringify(e, null, 2), "utf8");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
