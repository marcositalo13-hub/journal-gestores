// Executa um PlanoQuadro no monday.
// por_mes: cria grupos de mês, cria ocorrências e move itens avulsos (sem alterar colunas de itens existentes).
// por_area: preenche Área, rotula regras, cria ocorrências e move encerrados. Nunca apaga nada.
// lista: só move encerrados para o grupo de finalizados.
import { ddmm, nomeDiaDaSemana, parseGrupoMes } from "../calendario";
import { getConfig, type JornalConfig, type TipoQuadro } from "../config";
import { mondayMutation, mondayQuery } from "../monday/client";
import type { Ocorrencia } from "../recorrencia";
import { RotuloNaoResolvido, resolverRotulo } from "../rotulos";
import { ordenarPorPosicao, type ColunaMapeada, type ItemNormalizado, type QuadroLido } from "./ler";
import type { PlanoQuadro } from "./planejar";


// ---------- funções puras ----------

/**
 * Valor no formato JSON do monday para o tipo REAL da coluna.
 * Status e dropdown são gravados pelo ID do rótulo ({index} / {ids}), resolvido nos rótulos ATUAIS
 * da coluna com o mesmo critério de comparação (sem prefixo numérico, caixa ou acento).
 * Rótulo que não existe mais → RotuloNaoResolvido (a gravação é pulada e registrada como falha).
 */
export function valorMonday(col: ColunaMapeada, v: { text?: string; label?: string; date?: string; number?: number; labels?: string[] }): unknown {
  const nome = col.titulo ?? col.id;
  const id = (rotulo: string) => {
    const r = resolverRotulo(col.rotulos, rotulo);
    if (!r) throw new RotuloNaoResolvido(nome, rotulo);
    return r.id;
  };
  switch (col.type) {
    case "status":
      return { index: id(v.label ?? v.text ?? "") };
    case "date":
      return { date: v.date };
    case "dropdown":
      return { ids: (v.labels ?? (v.text ? v.text.split(", ") : [])).map(id) };
    case "numbers":
      return String(v.number ?? v.text);
    case "long_text":
      return { text: v.text };
    default:
      return v.text ?? "";
  }
}

export function textoAjusteData(oc: Pick<Ocorrencia, "dataOriginal" | "dataEfetiva">): string | null {
  if (oc.dataEfetiva === oc.dataOriginal) return null;
  return `Data original ${ddmm(oc.dataOriginal)} (${nomeDiaDaSemana(oc.dataOriginal)}), ajustada para dia útil`;
}

/**
 * column_values de uma nova ocorrência. Copia da regra todas as colunas mapeadas EXCETO
 * Status, Chave, data e campo de motivo; esses são definidos para a ocorrência.
 */
export function montarColumnValues(
  regra: Pick<ItemNormalizado, "valores">,
  oc: Ocorrencia,
  tipo: TipoQuadro,
  colunas: Record<string, ColunaMapeada | null>,
  cfg: JornalConfig = getConfig(),
): Record<string, unknown> {
  const t = cfg.tipos_de_quadro[tipo];
  const proprias = new Set([t.status, "Chave", t.data, t.campo_motivo]);
  const out: Record<string, unknown> = {};

  for (const titulo of Object.keys(t.colunas)) {
    const col = colunas[titulo];
    const v = regra.valores[titulo];
    if (!col || proprias.has(titulo) || !v) continue;
    const vazio = v.text === "" && v.number === null && !v.labels?.length && !v.label && !v.date;
    if (vazio) continue;
    out[col.id] = valorMonday(col, {
      text: v.text,
      label: v.label ?? undefined,
      date: v.date ?? undefined,
      number: v.number ?? undefined,
      labels: v.labels ?? undefined,
    });
  }

  const set = (titulo: string, v: Parameters<typeof valorMonday>[1]) => {
    const col = colunas[titulo];
    if (col) out[col.id] = valorMonday(col, v);
  };
  set(t.data, { date: oc.dataEfetiva });
  set(t.status, { label: t.status_inicial });
  set("Chave", { text: oc.chave });
  const ajuste = textoAjusteData(oc);
  if (ajuste) set(t.campo_motivo, { text: ajuste });
  return out;
}

/**
 * column_values de uma ocorrência em quadro por_area: copia Tipo e Recorrência da regra;
 * Status inicial, Prazo = data original, Chave e Área são definidos para a ocorrência.
 */
export function montarColumnValuesArea(
  regra: Pick<ItemNormalizado, "valores">,
  oc: Ocorrencia,
  area: string,
  tipo: TipoQuadro,
  colunas: Record<string, ColunaMapeada | null>,
  cfg: JornalConfig = getConfig(),
): Record<string, unknown> {
  const t = cfg.tipos_de_quadro[tipo];
  const out: Record<string, unknown> = {};
  const set = (titulo: string, v: Parameters<typeof valorMonday>[1]) => {
    const col = colunas[titulo];
    if (col) out[col.id] = valorMonday(col, v);
  };
  const tipoItem = regra.valores["Tipo"]?.label;
  if (tipoItem) set("Tipo", { label: tipoItem });
  const recorrencia = regra.valores["Recorrência"]?.labels;
  if (recorrencia?.length) set("Recorrência", { labels: recorrencia });
  const obs = regra.valores[t.campo_motivo]?.text;
  if (obs) set(t.campo_motivo, { text: obs }); // o contexto escrito na regra acompanha cada ocorrência
  set(t.status, { label: t.status_inicial });
  set(t.data, { date: oc.dataOriginal });
  set("Chave", { text: oc.chave });
  set("Área", { labels: [area] });
  return out;
}

export interface MovimentoGrupo {
  grupoId: string;
  titulo: string;
  /** id do grupo que deve ficar imediatamente antes */
  depoisDe: string;
}

/**
 * Movimentos mínimos para que os grupos de mês fiquem logo após o Cadastro, em ordem crescente.
 * Grupos que não são mês nem Cadastro ficam onde estão (depois dos meses).
 */
export function ordenarGruposMes(grupos: { id: string; titulo: string }[], cfg: JornalConfig = getConfig()): MovimentoGrupo[] {
  const lista = [...grupos];
  const cadastro = lista.find((g) => g.titulo === cfg.grupo_cadastro);
  if (!cadastro) return [];
  const meses = lista
    .map((g) => ({ g, m: parseGrupoMes(g.titulo, cfg) }))
    .filter((x): x is { g: (typeof lista)[number]; m: { ano: number; mes: number } } => x.m !== null)
    .sort((a, b) => a.m.ano - b.m.ano || a.m.mes - b.m.mes)
    .map((x) => x.g);

  const movs: MovimentoGrupo[] = [];
  let ancora = cadastro;
  for (const g of meses) {
    const ia = lista.indexOf(ancora);
    if (lista.indexOf(g) !== ia + 1) {
      lista.splice(lista.indexOf(g), 1);
      lista.splice(lista.indexOf(ancora) + 1, 0, g);
      movs.push({ grupoId: g.id, titulo: g.titulo, depoisDe: ancora.id });
    }
    ancora = g;
  }
  return movs;
}

/** Grupo após o qual um novo mês deve ser criado: último mês anterior a ele, senão o Cadastro. */
export function grupoAnteriorPara(titulo: string, grupos: { id: string; titulo: string }[], cfg: JornalConfig = getConfig()): string | null {
  const alvo = parseGrupoMes(titulo, cfg);
  if (!alvo) return null;
  const v = (m: { ano: number; mes: number }) => m.ano * 12 + m.mes;
  let melhor: { id: string; k: number } | null = null;
  for (const g of grupos) {
    const m = parseGrupoMes(g.titulo, cfg);
    if (m && v(m) < v(alvo) && (!melhor || v(m) > melhor.k)) melhor = { id: g.id, k: v(m) };
  }
  return melhor?.id ?? grupos.find((g) => g.titulo === cfg.grupo_cadastro)?.id ?? null;
}

// ---------- execução ----------

export interface RelatorioAplicacao {
  quadroId: string;
  quadroNome: string;
  gruposCriados: { titulo: string; id: string }[];
  gruposReordenados: { titulo: string; depoisDe: string }[];
  itensCriados: { nome: string; data: string; chave: string; id: string; grupo: string }[];
  itensMovidos: { nome: string; id: string; grupo: string }[];
  /** por_area */
  areasAtualizadas: { nome: string; id: string; area: string }[];
  /** por_area */
  regrasRotuladas: { nome: string; id: string; status: string }[];
  falhas: { acao: string; alvo: string; erro: string }[];
}

const M_CRIAR_GRUPO = `
mutation ($board_id: ID!, $nome: String!, $rel: String, $metodo: PositionRelative) {
  create_group(board_id: $board_id, group_name: $nome, relative_to: $rel, position_relative_method: $metodo) { id title }
}`;
const M_MOVER_GRUPO = `
mutation ($board_id: ID!, $group_id: String!, $depois: String!) {
  update_group(board_id: $board_id, group_id: $group_id, group_attribute: relative_position_after, new_value: $depois) { id }
}`;
const M_CRIAR_ITEM = `
mutation ($board_id: ID!, $group_id: String!, $nome: String!, $valores: JSON!) {
  create_item(board_id: $board_id, group_id: $group_id, item_name: $nome, column_values: $valores) { id }
}`;
const M_MOVER_ITEM = `
mutation ($item_id: ID!, $group_id: String!) {
  move_item_to_group(item_id: $item_id, group_id: $group_id) { id }
}`;

const M_ATUALIZAR_COLUNAS = `
mutation ($board_id: ID!, $item_id: ID!, $valores: JSON!) {
  change_multiple_column_values(board_id: $board_id, item_id: $item_id, column_values: $valores) { id }
}`;

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function lerGrupos(boardId: string): Promise<{ id: string; titulo: string }[]> {
  const r = await mondayQuery<{ boards: { groups: { id: string; title: string; position: string | null }[] }[] }>(
    `query ($ids: [ID!]) { boards(ids: $ids) { groups { id title position } } }`,
    { ids: [boardId] },
  );
  return ordenarPorPosicao(r.boards[0]?.groups ?? []).map((g) => ({ id: g.id, titulo: g.title.trim() }));
}

/**
 * por_area, na ordem do plano: Área → rótulo das regras → ocorrências → finalização.
 * A Área vem antes de mover: um item finalizado sem Área perderia o gestor na edição.
 */
async function aplicarPlanoArea(q: QuadroLido, plano: PlanoQuadro, rel: RelatorioAplicacao, cfg: JornalConfig): Promise<RelatorioAplicacao> {
  const t = cfg.tipos_de_quadro[q.tipo];
  const porId = new Map(q.itens.map((i) => [i.id, i]));
  const semArea = new Set<string>();
  const atualizar = (itemId: string, valores: Record<string, unknown>) =>
    mondayMutation(M_ATUALIZAR_COLUNAS, { board_id: q.id, item_id: itemId, valores: JSON.stringify(valores) });

  for (const a of plano.acoesArea) {
    if (a.tipo === "area_atualizada") {
      try {
        await atualizar(a.itemId, { [q.colunas["Área"]!.id]: valorMonday(q.colunas["Área"]!, { labels: [a.area] }) });
        rel.areasAtualizadas.push({ nome: a.itemNome, id: a.itemId, area: a.area });
      } catch (e) {
        semArea.add(a.itemId);
        rel.falhas.push({ acao: "area_atualizada", alvo: a.itemNome, erro: msg(e) });
      }
    } else if (a.tipo === "regra_rotulada") {
      try {
        await atualizar(a.itemId, { [q.colunas[t.status]!.id]: valorMonday(q.colunas[t.status]!, { label: a.status }) });
        rel.regrasRotuladas.push({ nome: a.itemNome, id: a.itemId, status: a.status });
      } catch (e) {
        rel.falhas.push({ acao: "regra_rotulada", alvo: a.itemNome, erro: msg(e) });
      }
    } else if (a.tipo === "seria_criada") {
      const regra = porId.get(a.regraId);
      if (!regra) {
        rel.falhas.push({ acao: "create_item", alvo: a.ocorrencia.chave, erro: "regra não encontrada" });
        continue;
      }
      try {
        const valores = montarColumnValuesArea(regra, a.ocorrencia, a.area, q.tipo, q.colunas, cfg);
        const r = await mondayMutation<{ create_item: { id: string } }>(M_CRIAR_ITEM, { board_id: q.id, group_id: a.grupo.id, nome: a.itemNome, valores: JSON.stringify(valores) });
        rel.itensCriados.push({ nome: a.itemNome, data: a.ocorrencia.dataOriginal, chave: a.ocorrencia.chave, id: r.create_item.id, grupo: a.grupo.titulo });
      } catch (e) {
        rel.falhas.push({ acao: "create_item", alvo: `${a.itemNome} ${a.ocorrencia.chave}`, erro: msg(e) });
      }
    } else {
      if (semArea.has(a.itemId)) {
        rel.falhas.push({ acao: "seria_finalizado", alvo: a.itemNome, erro: "pulado: a Área não foi gravada" });
        continue;
      }
      try {
        await mondayMutation(M_MOVER_ITEM, { item_id: a.itemId, group_id: a.grupo.id });
        rel.itensMovidos.push({ nome: a.itemNome, id: a.itemId, grupo: a.grupo.titulo });
      } catch (e) {
        rel.falhas.push({ acao: "move_item_to_group", alvo: a.itemNome, erro: msg(e) });
      }
    }
  }
  return rel;
}

/** Aplica o plano sequencialmente. Falhas são registradas; ações dependentes são puladas. */
export async function aplicarPlano(q: QuadroLido, plano: PlanoQuadro, cfg: JornalConfig = getConfig()): Promise<RelatorioAplicacao> {
  const rel: RelatorioAplicacao = {
    quadroId: q.id,
    quadroNome: q.nome,
    gruposCriados: [],
    gruposReordenados: [],
    itensCriados: [],
    itensMovidos: [],
    areasAtualizadas: [],
    regrasRotuladas: [],
    falhas: [],
  };
  if (q.layout !== "por_mes") return aplicarPlanoArea(q, plano, rel, cfg); // por_area e lista (esta só tem "finalizado")

  const grupos = [...q.grupos];
  const idDoGrupo = (titulo: string) => grupos.find((g) => g.titulo === titulo)?.id;
  const falhou = new Set<string>();

  // a. grupos de mês faltantes, em ordem crescente
  const faltantes = [...new Set(plano.acoes.filter((a) => a.tipo !== "existe" && !idDoGrupo(a.ocorrencia.grupoMes)).map((a) => a.ocorrencia.grupoMes))];
  faltantes.sort((a, b) => {
    const [x, y] = [parseGrupoMes(a, cfg)!, parseGrupoMes(b, cfg)!];
    return x.ano - y.ano || x.mes - y.mes;
  });
  for (const titulo of faltantes) {
    const rel_to = grupoAnteriorPara(titulo, grupos, cfg);
    try {
      const r = await mondayMutation<{ create_group: { id: string } }>(M_CRIAR_GRUPO, {
        board_id: q.id,
        nome: titulo,
        rel: rel_to,
        metodo: rel_to ? "after_at" : null,
      });
      const id = r.create_group.id;
      const i = rel_to ? grupos.findIndex((g) => g.id === rel_to) + 1 : 0;
      grupos.splice(i, 0, { id, titulo });
      rel.gruposCriados.push({ titulo, id });
    } catch (e) {
      falhou.add(titulo);
      rel.falhas.push({ acao: "create_group", alvo: titulo, erro: msg(e) });
    }
  }

  // ordem final: Cadastro, depois meses crescentes (relê as posições reais do quadro)
  if (!falhou.size) {
    try {
      const atuais = await lerGrupos(q.id);
      for (const m of ordenarGruposMes(atuais, cfg)) {
        try {
          await mondayMutation(M_MOVER_GRUPO, { board_id: q.id, group_id: m.grupoId, depois: m.depoisDe });
          rel.gruposReordenados.push({ titulo: m.titulo, depoisDe: atuais.find((g) => g.id === m.depoisDe)?.titulo ?? m.depoisDe });
        } catch (e) {
          rel.falhas.push({ acao: "update_group(posição)", alvo: m.titulo, erro: msg(e) });
        }
      }
    } catch (e) {
      rel.falhas.push({ acao: "ler grupos", alvo: q.id, erro: msg(e) });
    }
  }

  const porId = new Map(q.itens.map((i) => [i.id, i]));
  for (const a of plano.acoes) {
    if (a.tipo === "existe") continue;
    const oc = a.ocorrencia;
    const grupoId = idDoGrupo(oc.grupoMes);
    if (!grupoId) {
      rel.falhas.push({ acao: a.tipo, alvo: `${a.itemNome} ${oc.dataEfetiva}`, erro: `pulado: grupo "${oc.grupoMes}" indisponível` });
      continue;
    }

    // b. nova ocorrência
    if (a.tipo === "seria_criada") {
      const regra = porId.get(a.itemId);
      if (!regra) {
        rel.falhas.push({ acao: "create_item", alvo: oc.chave, erro: "regra não encontrada" });
        continue;
      }
      try {
        const valores = montarColumnValues(regra, oc, q.tipo, q.colunas, cfg);
        const r = await mondayMutation<{ create_item: { id: string } }>(M_CRIAR_ITEM, {
          board_id: q.id,
          group_id: grupoId,
          nome: regra.nome,
          valores: JSON.stringify(valores),
        });
        rel.itensCriados.push({ nome: regra.nome, data: oc.dataEfetiva, chave: oc.chave, id: r.create_item.id, grupo: oc.grupoMes });
      } catch (e) {
        rel.falhas.push({ acao: "create_item", alvo: `${a.itemNome} ${oc.chave}`, erro: msg(e) });
      }
      continue;
    }

    // c. avulso: só muda de grupo, nenhuma coluna é alterada
    try {
      await mondayMutation(M_MOVER_ITEM, { item_id: a.itemId, group_id: grupoId });
      rel.itensMovidos.push({ nome: a.itemNome, id: a.itemId, grupo: oc.grupoMes });
    } catch (e) {
      rel.falhas.push({ acao: "move_item_to_group", alvo: a.itemNome, erro: msg(e) });
    }
  }
  return rel;
}
