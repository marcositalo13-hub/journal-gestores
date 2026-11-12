import { parseGrupoMes } from "../calendario";
import { getConfig, gestorDaArea, grupoFinalizadasDoQuadro, type JornalConfig, type LayoutQuadro, type QuadroConfig, type TipoColuna, type TipoQuadro } from "../config";
import { mondayQuery } from "../monday/client";
import { parseFrequencia } from "../recorrencia";
import { mesmoRotulo, parseRotulosDaColuna, resolverRotulo, type RotuloColuna } from "../rotulos";

// ---------- tipos crus da API ----------
export interface ColunaApi {
  id: string;
  title: string;
  type: string;
  settings_str?: string | null;
  capabilities?: { calculated?: { function?: string | null } | null } | null;
}
export interface ValorApi {
  id: string;
  text: string | null;
  label?: string | null;
  date?: string | null;
  number?: number | null;
  values?: { label: string }[] | null;
}
export interface SubitemApi {
  id: string;
  column_values: (ValorApi & { column?: { title: string } | null })[];
}
export interface ItemApi {
  id: string;
  name: string;
  url: string;
  updated_at: string;
  created_at?: string | null;
  group: { id: string; title: string } | null;
  column_values: ValorApi[];
  subitems?: SubitemApi[] | null;
}
interface PaginaApi {
  cursor: string | null;
  items: ItemApi[];
}
export interface QuadroApi {
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
    | "grupo_finalizadas_ausente"
    | "rotulo_nao_encontrado"
    | "recorrencia_diaria_nao_suportada"
    | "item_sem_area"
    | "regra_sem_data"
    | "obrigatoria_vazia"
    | "status_vazio"
    | "travado_sem_motivo"
    | "cadastro_sem_recorrencia"
    | "prazo_movido_para_subitens"
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
  /** título da coluna (para mensagens) */
  titulo?: string;
  /** rótulos atuais de uma coluna status/dropdown, com os IDs usados nas gravações */
  rotulos?: RotuloColuna[];
}

/** Quadros por_area. Regra: recorrente sem Chave. Ocorrência: tem Chave. Único: o resto. */
export type ClasseItem = "regra" | "ocorrencia" | "unico";

export interface DadosPorArea {
  classe: ClasseItem;
  /** área do grupo em que o item está; null no grupo de finalizadas ou em grupo desconhecido */
  areaGrupo: string | null;
  /** está no grupo de finalizadas? */
  finalizada: boolean;
}

/** Quadros "lista" (Pagamentos): o item está no grupo de finalizados? */
export interface DadosLista {
  finalizada: boolean;
}

export interface ItemNormalizado {
  id: string;
  nome: string;
  url: string;
  updatedAt: string;
  /** criação do item no monday (ISO); usado pelas notificações */
  createdAt: string;
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
  /** presente só em quadros por_area */
  porArea?: DadosPorArea;
  /** presente só em quadros lista */
  lista?: DadosLista;
}

export interface QuadroLido {
  id: string;
  nome: string;
  tipo: TipoQuadro;
  layout: LayoutQuadro;
  dono: string;
  hierarchyType: string | null;
  /** grupo de itens finalizados deste quadro (por_area e lista) */
  grupoFinalizadas: string;
  /** grupos na ordem do quadro (por position) */
  grupos: { id: string; titulo: string }[];
  /** colunas mapeadas por título (null se ausente) */
  colunas: Record<string, ColunaMapeada | null>;
  itens: ItemNormalizado[];
  avisos: Aviso[];
}

// ---------- GraphQL ----------
export const ITEM_FIELDS = `
  id name url updated_at created_at
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
    columns { id title type settings_str capabilities { calculated { function } } }
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
    colunas[titulo] = { id: col.id, type: col.type, titulo, rotulos: parseRotulosDaColuna(col.type, col.settings_str) };
    if (!TIPOS_ACEITOS[tipoEsperado].includes(col.type)) {
      av({ codigo: "tipo_coluna_errado", mensagem: `Coluna "${titulo}" é "${col.type}", esperado "${tipoEsperado}".` });
    }
    if (col.capabilities?.calculated != null) {
      const fn = col.capabilities.calculated.function ?? "?";
      av({ codigo: "rollup_ativo", mensagem: `Coluna "${titulo}" tem cálculo/rollup ativo (${fn}): sobrescreve os valores do item pai. Desative.` });
    }
  }

  // Rótulos que o coletor GRAVA precisam existir (pelo nome normalizado); senão a gravação é pulada.
  const exigeRotulo = (titulo: string, nome: string | undefined) => {
    const col = colunas[titulo];
    if (!nome || !col || resolverRotulo(col.rotulos, nome)) return;
    av({ codigo: "rotulo_nao_encontrado", mensagem: `Rótulo "${nome}" não existe na coluna "${titulo}"; as gravações que o usam serão puladas.` });
  };
  exigeRotulo(tipoCfg.status, tipoCfg.status_inicial);
  const porArea = qc.layout === "por_area";
  const porMes = qc.layout === "por_mes";
  const lista = qc.layout === "lista";
  const grupoFinalizadas = grupoFinalizadasDoQuadro(qc, cfg);
  if (porArea) {
    exigeRotulo(tipoCfg.status, tipoCfg.status_regra);
    for (const g of cfg.gestores) exigeRotulo("Área", g.area);
  }
  if (porMes && !quadro.groups.some((g) => g.title.trim() === cfg.grupo_cadastro)) {
    av({ codigo: "grupo_cadastro_ausente", mensagem: `Grupo "${cfg.grupo_cadastro}" não existe no quadro.` });
  }
  if ((porArea || lista) && !quadro.groups.some((g) => g.title.trim() === grupoFinalizadas)) {
    av({ codigo: "grupo_finalizadas_ausente", mensagem: `Grupo "${grupoFinalizadas}" não existe no quadro; nada será finalizado.` });
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
      createdAt: it.created_at ?? it.updated_at,
      grupo,
      noCadastro: porMes && grupo.titulo === cfg.grupo_cadastro,
      valores,
      data: valores[tipoCfg.data]?.date ?? null,
      status: valores[tipoCfg.status]?.label ?? null,
      recorrencia: txt("Recorrência"),
      chave: txt("Chave"),
      motivo: txt(tipoCfg.campo_motivo),
      etapas: contarEtapas(it.subitems ?? [], tipoCfg.status, tipoCfg.status_concluido, tipoCfg.status_cancelado),
      datasSubitens: datasDeSubitens(it.subitems ?? [], tipoCfg.data, tipoCfg.status, tipoCfg.status_cancelado),
    };
    if (porArea) {
      n.porArea = {
        classe: classificarItem(n.recorrencia, n.chave),
        areaGrupo: gestorDaArea(grupo.titulo, cfg) ? grupo.titulo : null,
        finalizada: grupo.titulo === cfg.grupo_finalizadas,
      };
    }

    if (lista) n.lista = { finalizada: grupo.titulo === grupoFinalizadas };

    const ctx = { itemId: n.id, itemNome: n.nome };
    for (const ob of tipoCfg.obrigatorias) {
      // coluna ausente já foi reportada no nível do quadro
      if (idPorTitulo[ob] && !valorPreenchido(valores[ob], tipoCfg.colunas[ob])) {
        av({ ...ctx, codigo: "obrigatoria_vazia", mensagem: `"${n.nome}": campo obrigatório "${ob}" vazio.` });
      }
    }
    // Status vazio não esconde o item (conta como "aberto"), mas pede correção. Regra recorrente é rotulada pelo próprio coletor.
    if (idPorTitulo[tipoCfg.status] && !n.status?.trim() && n.porArea?.classe !== "regra") {
      const area = n.porArea ? (areaDaColuna(n, cfg) ?? n.porArea.areaGrupo) : null;
      av({ ...ctx, codigo: "status_vazio", mensagem: `"${n.nome}"${area ? ` (${area})` : ""}: Status vazio; o item aparece como aberto. Preencha o Status no monday.` });
    }
    if (tipoCfg.status_travado && mesmoRotulo(n.status, tipoCfg.status_travado) && vazio(n.motivo)) {
      av({ ...ctx, codigo: "travado_sem_motivo", mensagem: `"${n.nome}": status "${tipoCfg.status_travado}" sem motivo em "${tipoCfg.campo_motivo}".` });
    }
    if (n.noCadastro && idPorTitulo["Recorrência"] && vazio(n.recorrencia)) {
      av({ ...ctx, codigo: "cadastro_sem_recorrencia", mensagem: `"${n.nome}": item do Cadastro sem "Recorrência".` });
    }
    if (
      ehRegraSemData(n) &&
      !mesmoRotulo(n.status, tipoCfg.status_cancelado) &&
      !mesmoRotulo(n.status, tipoCfg.status_concluido)
    ) {
      av({
        ...ctx,
        codigo: "regra_sem_data",
        mensagem: `Regra "${n.nome}" (${n.porArea?.areaGrupo}): sem "${tipoCfg.data}" (data da primeira entrega). Sem ela não são criadas as cópias e a recorrência não aparece no painel.`,
      });
    }
    if (n.porArea?.finalizada && n.porArea.classe !== "regra" && !gestorDaArea(areaDaColuna(n, cfg), cfg)) {
      av({ ...ctx, codigo: "item_sem_area", mensagem: `"${n.nome}": sem "Área" em "${cfg.grupo_finalizadas}"; ficará como "Sem área" na edição.` });
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

  for (const d of detectarChavesDuplicadas(itens, cfg, qc.layout)) {
    av({ codigo: "chave_duplicada", mensagem: `Chave "${d.chave}" repetida em ${d.itens.length} itens${porArea ? "" : " de grupos de mês"}: ${d.itens.map((i) => `${i.id} (${i.grupo})`).join(", ")}. Corrija manualmente.` });
  }
  const comItens = new Set(itens.map((i) => i.grupo.titulo));
  for (const g of quadro.groups) {
    const t = g.title.trim();
    if (porArea) {
      if (t !== cfg.grupo_finalizadas && !gestorDaArea(t, cfg)) {
        av({ codigo: "grupo_desconhecido", mensagem: `Grupo "${t}" não é uma área do config nem "${cfg.grupo_finalizadas}"; seus itens são ignorados.` });
      }
    } else if (lista) {
      // lista: todo grupo vale (o de entrada e o de finalizados); nada a avisar
    } else if (t !== cfg.grupo_cadastro && !parseGrupoMes(t, cfg) && comItens.has(t)) {
      av({ codigo: "grupo_desconhecido", mensagem: `Grupo "${t}" não é "${cfg.grupo_cadastro}" nem um mês válido, mas tem itens.` });
    }
  }

  return {
    id: quadro.id,
    nome: quadro.name,
    tipo: qc.tipo,
    layout: qc.layout,
    dono: qc.dono,
    hierarchyType: quadro.hierarchy_type,
    grupoFinalizadas,
    grupos: ordenarPorPosicao(quadro.groups).map((g) => ({ id: g.id, titulo: g.title.trim() })),
    colunas,
    itens,
    avisos,
  };
}

/** Regra: recorrência válida e Chave vazia. Ocorrência: tem Chave. Único: o resto (inclui "Não recorrente" e vazio). */
export function classificarItem(recorrencia: string | null, chave: string | null): ClasseItem {
  if (chave && chave.trim()) return "ocorrencia";
  const f = parseFrequencia(recorrencia);
  return f !== null && f !== "nao_recorrente" && f !== "diaria" ? "regra" : "unico";
}

/**
 * Regra recorrente (por_area) numa área, sem Prazo (nem datas nos subitens): o coletor não consegue projetar
 * as ocorrências e ela nunca apareceria. Vira item "sem prazo" na edição e aviso no coletor.
 */
export function ehRegraSemData(it: Pick<ItemNormalizado, "porArea" | "data" | "datasSubitens">): boolean {
  return it.porArea?.classe === "regra" && it.porArea.areaGrupo !== null && !it.porArea.finalizada && !it.data && it.datasSubitens.length === 0;
}

/** O item está no grupo de finalizados (por_area ou lista)? */
export function estaFinalizado(it: Pick<ItemNormalizado, "porArea" | "lista">): boolean {
  return !!(it.porArea?.finalizada || it.lista?.finalizada);
}

/** Área preenchida na coluna Área (primeiro rótulo que é uma área do config), ou null. */
export function areaDaColuna(it: Pick<ItemNormalizado, "valores">, cfg: JornalConfig = getConfig()): string | null {
  const v = it.valores["Área"];
  const rotulos = v?.labels?.length ? v.labels : v?.text ? [v.text] : [];
  return rotulos.find((r) => gestorDaArea(r, cfg)) ?? null;
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
    if (mesmoRotulo(label, statusCancelado)) continue;
    total++;
    if (mesmoRotulo(label, statusConcluido)) concluidas++;
  }
  return total > 0 ? { total, concluidas } : null;
}

/** Datas dos subitens (coluna achada pelo TÍTULO), ignorando os cancelados. */
export function datasDeSubitens(subitens: SubitemApi[], tituloData: string, tituloStatus: string, statusCancelado: string): string[] {
  const out: string[] = [];
  for (const s of subitens) {
    const st = s.column_values.find((c) => c.column?.title?.trim() === tituloStatus);
    if (mesmoRotulo(st?.label ?? st?.text, statusCancelado)) continue;
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

/** Itens que compartilham a mesma Chave: em grupos de mês (por_mes) ou no quadro inteiro (por_area). Nunca corrige nada. */
export function detectarChavesDuplicadas(
  itens: Pick<ItemNormalizado, "id" | "chave" | "grupo">[],
  cfg: JornalConfig = getConfig(),
  layout: LayoutQuadro = "por_mes",
): { chave: string; itens: { id: string; grupo: string }[] }[] {
  const porChave = new Map<string, { id: string; grupo: string }[]>();
  for (const it of itens) {
    if (!it.chave || (layout === "por_mes" && !parseGrupoMes(it.grupo.titulo, cfg))) continue;
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
        layout: qc.layout,
        dono: qc.dono,
        hierarchyType: null,
        grupoFinalizadas: grupoFinalizadasDoQuadro(qc, cfg),
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
