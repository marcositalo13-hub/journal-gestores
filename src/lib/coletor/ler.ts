import { parseGrupoMes } from "../calendario";
import { getConfig, gestorDaCoordenacao, type JornalConfig, type QuadroConfig, type TipoColuna, type TipoQuadro } from "../config";
import { mondayQuery } from "../monday/client";

// ---------- tipos crus da API ----------
interface ColunaApi {
  id: string;
  title: string;
  type: string;
  capabilities?: { calculated?: { function?: string | null } | null } | null;
}
interface ValorApi {
  id: string;
  text: string | null;
  label?: string | null;
  date?: string | null;
  number?: number | null;
  values?: { label: string }[] | null;
}
interface SubitemApi {
  id: string;
  column_values: (ValorApi & { column?: { title: string } | null })[];
}
interface ItemApi {
  id: string;
  name: string;
  url: string;
  updated_at: string;
  group: { id: string; title: string } | null;
  column_values: ValorApi[];
  subitems?: SubitemApi[] | null;
}
interface PaginaApi {
  cursor: string | null;
  items: ItemApi[];
}
interface QuadroApi {
  id: string;
  name: string;
  hierarchy_type: string | null;
  columns: ColunaApi[];
  groups: { id: string; title: string; position: string | null }[];
  items_page: PaginaApi;
}

// ---------- tipos normalizados ----------
export interface Aviso {
  quadroId: string;
  codigo:
    | "quadro_nao_encontrado"
    | "coluna_ausente"
    | "tipo_coluna_errado"
    | "rollup_ativo"
    | "grupo_cadastro_ausente"
    | "obrigatoria_vazia"
    | "travado_sem_motivo"
    | "cadastro_sem_recorrencia"
    | "prazo_movido_para_subitens"
    | "pagamento_sem_coordenacao"
    | "recorrencia_desconhecida"
    | "chave_duplicada"
    | "grupo_desconhecido"
    | "calendario";
  mensagem: string;
  itemId?: string;
  itemNome?: string;
}

export interface Valor {
  text: string;
  label: string | null;
  date: string | null;
  number: number | null;
  /** rótulos de dropdown */
  labels: string[] | null;
}

export interface ColunaMapeada {
  id: string;
  /** tipo real no monday (ex.: "long_text") */
  type: string;
}

export interface ItemNormalizado {
  id: string;
  nome: string;
  url: string;
  updatedAt: string;
  grupo: { id: string; titulo: string };
  noCadastro: boolean;
  /** valores das colunas mapeadas, por título (null se a coluna não existe no quadro) */
  valores: Record<string, Valor | null>;
  data: string | null;
  status: string | null;
  recorrencia: string | null;
  chave: string | null;
  motivo: string | null;
  /** progresso dos subitens (cancelados não contam); null se não há subitens */
  etapas: { total: number; concluidas: number } | null;
  /** datas dos subitens não cancelados (YYYY-MM-DD), para detectar prazo movido para os subitens */
  datasSubitens: string[];
}

export interface QuadroLido {
  id: string;
  nome: string;
  tipo: TipoQuadro;
  dono: string;
  hierarchyType: string | null;
  /** grupos na ordem do quadro (por position) */
  grupos: { id: string; titulo: string }[];
  /** colunas mapeadas por título (null se ausente) */
  colunas: Record<string, ColunaMapeada | null>;
  itens: ItemNormalizado[];
  avisos: Aviso[];
}

// ---------- GraphQL ----------
const ITEM_FIELDS = `
  id name url updated_at
  group { id title }
  column_values {
    id text
    ... on StatusValue { label }
    ... on DateValue { date }
    ... on NumbersValue { number }
    ... on DropdownValue { values { label } }
  }
  subitems { id column_values { id text column { title } ... on StatusValue { label } ... on DateValue { date } } }`;

const Q_QUADRO = `
query ($ids: [ID!]) {
  boards(ids: $ids) {
    id name hierarchy_type
    columns { id title type capabilities { calculated { function } } }
    groups { id title position }
    items_page(limit: 100) { cursor items { ${ITEM_FIELDS} } }
  }
}`;

const Q_PROXIMA = `
query ($cursor: String!) {
  next_items_page(cursor: $cursor, limit: 100) { cursor items { ${ITEM_FIELDS} } }
}`;

/** Tipos monday aceitos para cada tipo configurado. */
const TIPOS_ACEITOS: Record<TipoColuna, string[]> = {
  status: ["status"],
  date: ["date"],
  dropdown: ["dropdown"],
  text: ["text", "long_text"],
  numbers: ["numbers"],
};

const vazio = (s: string | null | undefined) => !s || s.trim() === "";

async function buscarQuadro(id: string): Promise<{ quadro: QuadroApi; itens: ItemApi[] } | null> {
  const data = await mondayQuery<{ boards: QuadroApi[] }>(Q_QUADRO, { ids: [id] });
  const quadro = data.boards?.[0];
  if (!quadro) return null;
  const itens = [...quadro.items_page.items];
  let cursor = quadro.items_page.cursor;
  while (cursor) {
    const p = await mondayQuery<{ next_items_page: PaginaApi }>(Q_PROXIMA, { cursor });
    itens.push(...p.next_items_page.items);
    cursor = p.next_items_page.cursor;
  }
  return { quadro, itens };
}

function normalizarValor(v: ValorApi | undefined, tipo: TipoColuna): Valor | null {
  if (!v) return null;
  const text = (v.text ?? "").trim();
  return {
    text,
    label: tipo === "status" ? (v.label ?? (text || null)) : null,
    date: tipo === "date" ? (v.date ?? (text ? text.slice(0, 10) : null)) : null,
    number: tipo === "numbers" ? (typeof v.number === "number" ? v.number : text && !isNaN(Number(text)) ? Number(text) : null) : null,
    labels: tipo === "dropdown" ? (v.values?.map((x) => x.label) ?? (text ? text.split(", ") : [])) : null,
  };
}

function valorPreenchido(v: Valor | null, tipo: TipoColuna): boolean {
  if (!v) return false;
  if (tipo === "date") return !!v.date;
  if (tipo === "numbers") return v.number !== null;
  if (tipo === "status") return !vazio(v.label);
  return !vazio(v.text);
}

/** Valida estrutura do quadro e normaliza itens. Avisos são coletados, nunca lançados. */
export function normalizarQuadro(qc: QuadroConfig, quadro: QuadroApi, itensApi: ItemApi[], cfg: JornalConfig = getConfig()): QuadroLido {
  const tipoCfg = cfg.tipos_de_quadro[qc.tipo];
  const avisos: Aviso[] = [];
  const av = (a: Omit<Aviso, "quadroId">) => avisos.push({ quadroId: qc.id, ...a });

  // Mapeia colunas POR TÍTULO (ids variam por quadro).
  const idPorTitulo: Record<string, string | null> = {};
  const colunas: Record<string, ColunaMapeada | null> = {};
  for (const [titulo, tipoEsperado] of Object.entries(tipoCfg.colunas)) {
    const achadas = quadro.columns.filter((c) => c.title.trim() === titulo);
    const col = achadas[0];
    if (!col) {
      av({ codigo: "coluna_ausente", mensagem: `Coluna "${titulo}" (${tipoEsperado}) não existe no quadro.` });
      idPorTitulo[titulo] = null;
      colunas[titulo] = null;
      continue;
    }
    if (achadas.length > 1) av({ codigo: "coluna_ausente", mensagem: `Coluna "${titulo}" aparece ${achadas.length}x; usando a primeira (${col.id}).` });
    idPorTitulo[titulo] = col.id;
    colunas[titulo] = { id: col.id, type: col.type };
    if (!TIPOS_ACEITOS[tipoEsperado].includes(col.type)) {
      av({ codigo: "tipo_coluna_errado", mensagem: `Coluna "${titulo}" é "${col.type}", esperado "${tipoEsperado}".` });
    }
    if (col.capabilities?.calculated != null) {
      const fn = col.capabilities.calculated.function ?? "?";
      av({ codigo: "rollup_ativo", mensagem: `Coluna "${titulo}" tem cálculo/rollup ativo (${fn}): sobrescreve os valores do item pai. Desative.` });
    }
  }

  if (!quadro.groups.some((g) => g.title.trim() === cfg.grupo_cadastro)) {
    av({ codigo: "grupo_cadastro_ausente", mensagem: `Grupo "${cfg.grupo_cadastro}" não existe no quadro.` });
  }

  const itens: ItemNormalizado[] = itensApi.map((it) => {
    const porId = new Map(it.column_values.map((v) => [v.id, v]));
    const valores: Record<string, Valor | null> = {};
    for (const [titulo, tipo] of Object.entries(tipoCfg.colunas)) {
      const id = idPorTitulo[titulo];
      valores[titulo] = id ? normalizarValor(porId.get(id), tipo) : null;
    }
    const grupo = { id: it.group?.id ?? "", titulo: (it.group?.title ?? "").trim() };
    const txt = (t: string) => (valores[t]?.text ? valores[t]!.text : null);
    const n: ItemNormalizado = {
      id: it.id,
      nome: it.name,
      url: it.url,
      updatedAt: it.updated_at,
      grupo,
      noCadastro: grupo.titulo === cfg.grupo_cadastro,
      valores,
      data: valores[tipoCfg.data]?.date ?? null,
      status: valores[tipoCfg.status]?.label ?? null,
      recorrencia: txt("Recorrência"),
      chave: txt("Chave"),
      motivo: txt(tipoCfg.campo_motivo),
      etapas: contarEtapas(it.subitems ?? [], tipoCfg.status, tipoCfg.status_concluido, tipoCfg.status_cancelado),
      datasSubitens: datasDeSubitens(it.subitems ?? [], tipoCfg.data, tipoCfg.status, tipoCfg.status_cancelado),
    };

    const ctx = { itemId: n.id, itemNome: n.nome };
    for (const ob of tipoCfg.obrigatorias) {
      // coluna ausente já foi reportada no nível do quadro
      if (idPorTitulo[ob] && !valorPreenchido(valores[ob], tipoCfg.colunas[ob])) {
        av({ ...ctx, codigo: "obrigatoria_vazia", mensagem: `"${n.nome}": campo obrigatório "${ob}" vazio.` });
      }
    }
    if (n.status === tipoCfg.status_travado && vazio(n.motivo)) {
      av({ ...ctx, codigo: "travado_sem_motivo", mensagem: `"${n.nome}": status "${tipoCfg.status_travado}" sem motivo em "${tipoCfg.campo_motivo}".` });
    }
    if (n.noCadastro && idPorTitulo["Recorrência"] && vazio(n.recorrencia)) {
      av({ ...ctx, codigo: "cadastro_sem_recorrencia", mensagem: `"${n.nome}": item do Cadastro sem "Recorrência".` });
    }
    if (qc.tipo === "pagamentos" && idPorTitulo["Coordenação"]) {
      const v = valores["Coordenação"];
      const rotulos = v?.labels?.length ? v.labels : v?.text ? v.text.split(",").map((x) => x.trim()).filter(Boolean) : [];
      if (!gestorDaCoordenacao(rotulos, cfg)) {
        av({
          ...ctx,
          codigo: "pagamento_sem_coordenacao",
          mensagem: rotulos.length
            ? `"${n.nome}": coordenação "${rotulos.join(", ")}" não está em config.coordenacoes; o item ficará com o dono do quadro (${qc.dono}).`
            : `"${n.nome}": pagamento sem coordenação; o item ficará com o dono do quadro (${qc.dono}).`,
        });
      }
    }
    if (!n.noCadastro && !n.data && n.datasSubitens.length) {
      av({
        ...ctx,
        codigo: "prazo_movido_para_subitens",
        mensagem: `"${n.nome}": sem "${tipoCfg.data}", mas os subitens têm data (${[...n.datasSubitens].sort().at(-1)}). O monday copia/limpa a data do pai ao criar o primeiro subitem; restaure a data no item pai.`,
      });
    }
    return n;
  });

  for (const d of detectarChavesDuplicadas(itens, cfg)) {
    av({ codigo: "chave_duplicada", mensagem: `Chave "${d.chave}" repetida em ${d.itens.length} itens de grupos de mês: ${d.itens.map((i) => `${i.id} (${i.grupo})`).join(", ")}. Corrija manualmente.` });
  }
  const comItens = new Set(itens.map((i) => i.grupo.titulo));
  for (const g of quadro.groups) {
    const t = g.title.trim();
    if (t !== cfg.grupo_cadastro && !parseGrupoMes(t, cfg) && comItens.has(t)) {
      av({ codigo: "grupo_desconhecido", mensagem: `Grupo "${t}" não é "${cfg.grupo_cadastro}" nem um mês válido, mas tem itens.` });
    }
  }

  return {
    id: quadro.id,
    nome: quadro.name,
    tipo: qc.tipo,
    dono: qc.dono,
    hierarchyType: quadro.hierarchy_type,
    grupos: ordenarPorPosicao(quadro.groups).map((g) => ({ id: g.id, titulo: g.title.trim() })),
    colunas,
    itens,
    avisos,
  };
}

/** Conta subitens pelo status (coluna localizada pelo TÍTULO, como no resto do coletor). */
export function contarEtapas(
  subitens: SubitemApi[],
  tituloStatus: string,
  statusConcluido: string,
  statusCancelado: string,
): { total: number; concluidas: number } | null {
  let total = 0;
  let concluidas = 0;
  for (const s of subitens) {
    const v = s.column_values.find((c) => c.column?.title?.trim() === tituloStatus);
    const label = (v?.label ?? v?.text ?? "").trim();
    if (label === statusCancelado) continue;
    total++;
    if (label === statusConcluido) concluidas++;
  }
  return total > 0 ? { total, concluidas } : null;
}

/** Datas dos subitens (coluna achada pelo TÍTULO), ignorando os cancelados. */
export function datasDeSubitens(subitens: SubitemApi[], tituloData: string, tituloStatus: string, statusCancelado: string): string[] {
  const out: string[] = [];
  for (const s of subitens) {
    const st = s.column_values.find((c) => c.column?.title?.trim() === tituloStatus);
    if ((st?.label ?? st?.text ?? "").trim() === statusCancelado) continue;
    const d = s.column_values.find((c) => c.column?.title?.trim() === tituloData)?.date;
    if (d) out.push(d);
  }
  return out;
}

/** A API não devolve os grupos na ordem do quadro; ordena por `position`. */
export function ordenarPorPosicao<G extends { position: string | null }>(grupos: G[]): G[] {
  return grupos
    .map((g, i) => ({ g, i, p: Number(g.position) }))
    .sort((a, b) => (Number.isFinite(a.p) && Number.isFinite(b.p) ? a.p - b.p : a.i - b.i))
    .map((x) => x.g);
}

/** Itens em grupos de mês que compartilham a mesma Chave (nunca corrige nada). */
export function detectarChavesDuplicadas(
  itens: Pick<ItemNormalizado, "id" | "chave" | "grupo">[],
  cfg: JornalConfig = getConfig(),
): { chave: string; itens: { id: string; grupo: string }[] }[] {
  const porChave = new Map<string, { id: string; grupo: string }[]>();
  for (const it of itens) {
    if (!it.chave || !parseGrupoMes(it.grupo.titulo, cfg)) continue;
    porChave.set(it.chave, [...(porChave.get(it.chave) ?? []), { id: it.id, grupo: it.grupo.titulo }]);
  }
  return [...porChave].filter(([, l]) => l.length > 1).map(([chave, l]) => ({ chave, itens: l }));
}

/** Lê e valida todos os quadros configurados (somente leitura). */
export async function lerQuadros(cfg: JornalConfig = getConfig()): Promise<QuadroLido[]> {
  const out: QuadroLido[] = [];
  for (const qc of cfg.quadros) {
    if (cfg.quadros_ignorados.includes(qc.id)) continue;
    const r = await buscarQuadro(qc.id);
    if (!r) {
      out.push({
        id: qc.id,
        nome: "(não encontrado)",
        tipo: qc.tipo,
        dono: qc.dono,
        hierarchyType: null,
        grupos: [],
        colunas: {},
        itens: [],
        avisos: [{ quadroId: qc.id, codigo: "quadro_nao_encontrado", mensagem: `Quadro ${qc.id} não encontrado ou sem acesso.` }],
      });
      continue;
    }
    out.push(normalizarQuadro(qc, r.quadro, r.itens, cfg));
  }
  return out;
}
