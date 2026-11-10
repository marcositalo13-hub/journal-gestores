import raw from "../../config/jornal.config.json";

export type TipoQuadro = "atividades" | "pagamentos";
export type TipoColuna = "status" | "date" | "dropdown" | "text" | "numbers";
/**
 * por_mes: Cadastro + grupos de mês. por_area: um grupo por área + grupo de finalizadas.
 * lista: itens digitados à mão, sem recorrência nem grupos de mês; só o grupo de finalizados (quadro de Pagamentos).
 */
export type LayoutQuadro = "por_mes" | "por_area" | "lista";
export type AjusteDiaNaoUtil = "manter_e_avisar" | "dia_util_mais_proximo";

export interface Leitor {
  email: string;
  nome: string;
}

export const RECORTES_FOTO = ["north", "center", "attention"] as const;
export type RecorteFoto = (typeof RECORTES_FOTO)[number];

export interface Notificacoes {
  /** "HH:MM" (São Paulo): fora da janela nada é enviado; a fila vai para o resumo da manhã */
  janela_inicio: string;
  janela_fim: string;
  /** intervalo mínimo entre envios "normais" (agrupados) */
  agrupar_minutos: number;
  /** R1/R4: item criado há no máximo N horas */
  novo_horas: number;
}

export interface Abas {
  /** false: a aba Pagamentos some para todos e /pagamentos responde 404 */
  pagamentos: boolean;
}

export interface PagamentosConfig {
  /** valor (R$) a partir do qual o pagamento exige a aprovação do diretor ("Acima de R$ 100 mil"); abaixo, "Área subordinada" */
  aprovacao_diretor_a_partir_de: number;
}

export interface Urgencia {
  /** itens com prazo nos próximos N dias úteis ficam em "amarelo" (atenção) */
  atencao_dias_uteis: number;
}

export interface Manchete {
  contrato_antecedencia_dias: number;
}

export interface Gestor {
  nome: string;
  area: string;
  /** nome curto da área, exibido junto do nome do gestor nas linhas */
  area_curta: string;
  reporta_a: string;
  quadro_id: string | null;
  /** WhatsApp só com dígitos, com código do país (ex.: "5561999999999"); opcional */
  whatsapp?: string;
}

export interface QuadroConfig {
  id: string;
  tipo: TipoQuadro;
  layout: LayoutQuadro;
  dono: string;
  /** grupo de itens finalizados deste quadro (obrigatório em "lista"; nos demais vale o grupo_finalizadas global) */
  grupo_finalizadas?: string;
}

export interface TipoQuadroConfig {
  data: string;
  status: string;
  colunas: Record<string, TipoColuna>;
  obrigatorias: string[];
  status_concluido: string;
  /** só em quadros de atividades; sem ele nenhum item é "travado" */
  status_travado?: string;
  status_cancelado: string;
  status_inicial: string;
  /** só em quadros por_area: rótulo que marca um item como regra de recorrência */
  status_regra?: string;
  campo_motivo: string;
  ajuste_dia_nao_util: AjusteDiaNaoUtil;
}

export interface JornalConfig {
  timezone: string;
  workspace_id: string;
  diretor: string;
  /** quem pode entrar no app (e-mail comparado em minúsculas) e o nome usado na saudação */
  leitores: Leitor[];
  gestores: Gestor[];
  quadros: QuadroConfig[];
  quadros_ignorados: string[];
  grupo_cadastro: string;
  /** por_area: grupo final de itens concluídos/cancelados e de recorrências encerradas */
  grupo_finalizadas: string;
  /** por_area: dias após o prazo para mover concluídos/cancelados ao grupo de finalizadas */
  finalizar_apos_dias: number;
  formato_grupo_mes: string;
  tipos_de_quadro: Record<TipoQuadro, TipoQuadroConfig>;
  empate_dia_util: "anterior" | "posterior";
  considerar_facultativos_como_nao_util: boolean;
  manchete: Manchete;
  urgencia: Urgencia;
  abas: Abas;
  pagamentos: PagamentosConfig;
  notificacoes: Notificacoes;
  /** recorte das fotos por slug ({"joao-silva": "center"}); o padrão é "north" */
  fotos_recorte?: Record<string, RecorteFoto>;
  feriados: string[];
  facultativos: string[];
}

const TIPOS_QUADRO: TipoQuadro[] = ["atividades", "pagamentos"];
const TIPOS_COLUNA: TipoColuna[] = ["status", "date", "dropdown", "text", "numbers"];
const AJUSTES: AjusteDiaNaoUtil[] = ["manter_e_avisar", "dia_util_mais_proximo"];
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ConfigError extends Error {
  constructor(erros: string[]) {
    super(`config/jornal.config.json inválido:\n  - ${erros.join("\n  - ")}`);
    this.name = "ConfigError";
  }
}

function ehDataValida(s: unknown): boolean {
  if (typeof s !== "string" || !DATA_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Valida um objeto qualquer como JornalConfig; lança ConfigError com todos os problemas. */
export function validarConfig(c: unknown): JornalConfig {
  const erros: string[] = [];
  const o = (c ?? {}) as Record<string, unknown>;
  const str = (k: string) => {
    if (typeof o[k] !== "string" || (o[k] as string).trim() === "") erros.push(`"${k}" deve ser string não vazia`);
  };
  const arr = (k: string) => {
    if (!Array.isArray(o[k])) {
      erros.push(`"${k}" deve ser array`);
      return [] as unknown[];
    }
    return o[k] as unknown[];
  };

  ["timezone", "workspace_id", "diretor", "grupo_cadastro", "grupo_finalizadas", "formato_grupo_mes"].forEach(str);
  if (typeof o.finalizar_apos_dias !== "number" || !Number.isInteger(o.finalizar_apos_dias) || o.finalizar_apos_dias < 0) {
    erros.push(`"finalizar_apos_dias" deve ser inteiro >= 0`);
  }

  if (typeof o.timezone === "string") {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: o.timezone });
    } catch {
      erros.push(`"timezone" desconhecido: ${o.timezone}`);
    }
  }
  if (typeof o.formato_grupo_mes === "string" && !(o.formato_grupo_mes.includes("{Mes}") && o.formato_grupo_mes.includes("{AAAA}"))) {
    erros.push(`"formato_grupo_mes" deve conter {Mes} e {AAAA}`);
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const leitores = arr("leitores");
  if (Array.isArray(o.leitores) && leitores.length === 0) erros.push(`"leitores" não pode ser vazio`);
  const vistos = new Set<string>();
  leitores.forEach((l, i) => {
    const x = (l ?? {}) as Record<string, unknown>;
    if (typeof x.nome !== "string" || x.nome.trim() === "") erros.push(`leitores[${i}].nome deve ser string não vazia`);
    if (typeof x.email !== "string" || !EMAIL_RE.test(x.email.trim())) {
      erros.push(`leitores[${i}].email não é um e-mail válido: ${String(x.email)}`);
      return;
    }
    const n = x.email.trim().toLowerCase();
    if (vistos.has(n)) erros.push(`leitores[${i}].email duplicado: ${x.email}`);
    vistos.add(n);
  });

  arr("gestores").forEach((g, i) => {
    const x = g as Record<string, unknown>;
    for (const k of ["nome", "area", "area_curta", "reporta_a"]) {
      if (typeof x?.[k] !== "string") erros.push(`gestores[${i}].${k} deve ser string`);
    }
    if (!(x?.quadro_id === null || typeof x?.quadro_id === "string")) erros.push(`gestores[${i}].quadro_id deve ser string ou null`);
    if (x?.whatsapp !== undefined && !(typeof x.whatsapp === "string" && /^\d{10,15}$/.test(x.whatsapp))) {
      erros.push(`gestores[${i}].whatsapp deve ter só dígitos (10 a 15), com código do país, ex.: "5561999999999"`);
    }
  });

  // Área → gestor precisa ser 1:1, e o grupo de finalizadas não pode se confundir com uma área.
  const areas = arr("gestores").map((g) => (g as Record<string, unknown>)?.area);
  areas.forEach((a, i) => {
    if (areas.indexOf(a) !== i) erros.push(`gestores[${i}].area duplicada: ${String(a)}`);
  });
  if (areas.includes(o.grupo_finalizadas)) erros.push(`"grupo_finalizadas" não pode ser igual à área de um gestor`);

  const ignorados = arr("quadros_ignorados");
  ignorados.forEach((q, i) => {
    if (typeof q !== "string") erros.push(`quadros_ignorados[${i}] deve ser string`);
  });

  const ids = new Set<string>();
  arr("quadros").forEach((q, i) => {
    const x = q as Record<string, unknown>;
    if (typeof x?.id !== "string" || !/^\d+$/.test(x.id)) erros.push(`quadros[${i}].id deve ser string numérica`);
    else {
      if (ids.has(x.id)) erros.push(`quadros[${i}].id duplicado: ${x.id}`);
      if (ignorados.includes(x.id)) erros.push(`quadros[${i}].id ${x.id} também está em quadros_ignorados`);
      ids.add(x.id);
    }
    if (!TIPOS_QUADRO.includes(x?.tipo as TipoQuadro)) erros.push(`quadros[${i}].tipo inválido: ${String(x?.tipo)}`);
    if (typeof x?.dono !== "string") erros.push(`quadros[${i}].dono deve ser string`);
    if (x?.layout !== "por_mes" && x?.layout !== "por_area" && x?.layout !== "lista") erros.push(`quadros[${i}].layout deve ser "por_mes", "por_area" ou "lista": ${String(x?.layout)}`);
    if (x?.grupo_finalizadas !== undefined && (typeof x.grupo_finalizadas !== "string" || x.grupo_finalizadas.trim() === "")) erros.push(`quadros[${i}].grupo_finalizadas deve ser string não vazia`);
    if (x?.layout === "lista" && typeof x.grupo_finalizadas !== "string") erros.push(`quadros[${i}]: layout lista exige grupo_finalizadas`);
    if (x?.layout === "por_mes" || x?.layout === "por_area") {
      const cols = (((o.tipos_de_quadro ?? {}) as Record<string, Record<string, unknown> | undefined>)[String(x?.tipo)]?.colunas ?? {}) as Record<string, unknown>;
      for (const k of ["Recorrência", "Chave"]) {
        if (!(k in cols)) erros.push(`quadros[${i}]: layout ${String(x.layout)} exige a coluna "${k}" em tipos_de_quadro.${String(x?.tipo)}.colunas`);
      }
    }
    if (x?.layout === "por_area") {
      const t = ((o.tipos_de_quadro ?? {}) as Record<string, Record<string, unknown> | undefined>)[String(x?.tipo)];
      if (typeof t?.status_regra !== "string") erros.push(`quadros[${i}]: layout por_area exige tipos_de_quadro.${String(x?.tipo)}.status_regra`);
      if (!(t?.colunas && "Área" in (t.colunas as object))) erros.push(`quadros[${i}]: layout por_area exige a coluna "Área" em tipos_de_quadro.${String(x?.tipo)}.colunas`);
    }
  });

  const tipos = (o.tipos_de_quadro ?? {}) as Record<string, unknown>;
  for (const t of TIPOS_QUADRO) {
    const x = tipos[t] as Record<string, unknown> | undefined;
    if (!x) {
      erros.push(`tipos_de_quadro.${t} ausente`);
      continue;
    }
    const p = `tipos_de_quadro.${t}`;
    const colunas = (x.colunas ?? {}) as Record<string, unknown>;
    if (typeof x.colunas !== "object" || x.colunas === null) erros.push(`${p}.colunas deve ser objeto`);
    for (const [titulo, tipo] of Object.entries(colunas)) {
      if (!TIPOS_COLUNA.includes(tipo as TipoColuna)) erros.push(`${p}.colunas["${titulo}"] tipo inválido: ${String(tipo)}`);
    }
    for (const k of ["data", "status", "campo_motivo"]) {
      if (typeof x[k] !== "string") erros.push(`${p}.${k} deve ser string`);
      else if (!(x[k] as string in colunas)) erros.push(`${p}.${k} ("${x[k]}") não está em colunas`);
    }
    if (typeof x.data === "string" && colunas[x.data] !== "date") erros.push(`${p}.data ("${x.data}") deve ser coluna do tipo date`);
    if (typeof x.status === "string" && colunas[x.status] !== "status") erros.push(`${p}.status ("${x.status}") deve ser coluna do tipo status`);
    for (const k of ["status_concluido", "status_cancelado", "status_inicial"]) {
      if (typeof x[k] !== "string") erros.push(`${p}.${k} deve ser string`);
    }
    if (x.status_travado !== undefined ? typeof x.status_travado !== "string" : t === "atividades") erros.push(`${p}.status_travado deve ser string`);
    if (!Array.isArray(x.obrigatorias)) erros.push(`${p}.obrigatorias deve ser array`);
    else
      for (const ob of x.obrigatorias) {
        if (typeof ob !== "string" || !(ob in colunas)) erros.push(`${p}.obrigatorias: "${String(ob)}" não está em colunas`);
      }
    if (!AJUSTES.includes(x.ajuste_dia_nao_util as AjusteDiaNaoUtil)) erros.push(`${p}.ajuste_dia_nao_util inválido: ${String(x.ajuste_dia_nao_util)}`);
  }

  if (o.empate_dia_util !== "anterior" && o.empate_dia_util !== "posterior") erros.push(`"empate_dia_util" deve ser "anterior" ou "posterior"`);
  if (typeof o.considerar_facultativos_como_nao_util !== "boolean") erros.push(`"considerar_facultativos_como_nao_util" deve ser boolean`);
  const mc = (o.manchete ?? {}) as Record<string, unknown>;
  if (typeof o.manchete !== "object" || o.manchete === null) erros.push(`"manchete" deve ser objeto`);
  else {
    const num = (k: string, inteiro: boolean) => {
      const v = mc[k];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || (inteiro && !Number.isInteger(v))) {
        erros.push(`manchete.${k} deve ser número ${inteiro ? "inteiro " : ""}>= 0`);
      }
    };
    num("contrato_antecedencia_dias", true);
  }
  const uc = (o.urgencia ?? {}) as Record<string, unknown>;
  if (typeof o.urgencia !== "object" || o.urgencia === null) erros.push(`"urgencia" deve ser objeto`);
  else if (typeof uc.atencao_dias_uteis !== "number" || !Number.isInteger(uc.atencao_dias_uteis) || uc.atencao_dias_uteis < 1) {
    erros.push(`urgencia.atencao_dias_uteis deve ser número inteiro >= 1`);
  }
  const ab = (o.abas ?? {}) as Record<string, unknown>;
  if (typeof o.abas !== "object" || o.abas === null) erros.push(`"abas" deve ser objeto`);
  else if (typeof ab.pagamentos !== "boolean") erros.push(`abas.pagamentos deve ser true ou false`);
  const pg = (o.pagamentos ?? {}) as Record<string, unknown>;
  if (typeof o.pagamentos !== "object" || o.pagamentos === null) erros.push(`"pagamentos" deve ser objeto`);
  else {
    if (typeof pg.aprovacao_diretor_a_partir_de !== "number" || !Number.isFinite(pg.aprovacao_diretor_a_partir_de) || pg.aprovacao_diretor_a_partir_de < 0) {
      erros.push(`pagamentos.aprovacao_diretor_a_partir_de deve ser número >= 0`);
    }
  }
  const nt = (o.notificacoes ?? {}) as Record<string, unknown>;
  if (typeof o.notificacoes !== "object" || o.notificacoes === null) erros.push(`"notificacoes" deve ser objeto`);
  else {
    const hhmm = (k: string) => {
      const v = nt[k];
      const m = typeof v === "string" ? /^(\d{2}):(\d{2})$/.exec(v) : null;
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) erros.push(`notificacoes.${k} deve ser "HH:MM"`);
    };
    hhmm("janela_inicio");
    hhmm("janela_fim");
    if (typeof nt.janela_inicio === "string" && typeof nt.janela_fim === "string" && nt.janela_inicio >= nt.janela_fim) {
      erros.push(`notificacoes.janela_inicio deve ser antes de janela_fim`);
    }
    for (const k of ["agrupar_minutos", "novo_horas"]) {
      const v = nt[k];
      if (typeof v !== "number" || !Number.isInteger(v) || v < 1) erros.push(`notificacoes.${k} deve ser número inteiro >= 1`);
    }
  }
  if (o.fotos_recorte !== undefined) {
    const fr = o.fotos_recorte;
    if (typeof fr !== "object" || fr === null || Array.isArray(fr)) erros.push(`"fotos_recorte" deve ser objeto`);
    else {
      for (const [slug, v] of Object.entries(fr)) {
        if (!RECORTES_FOTO.includes(v as RecorteFoto)) erros.push(`fotos_recorte.${slug} deve ser ${RECORTES_FOTO.join(", ")}`);
      }
    }
  }
  for (const k of ["feriados", "facultativos"]) {
    arr(k).forEach((d, i) => {
      if (!ehDataValida(d)) erros.push(`${k}[${i}] não é data YYYY-MM-DD válida: ${String(d)}`);
    });
  }

  if (erros.length) throw new ConfigError(erros);
  return o as unknown as JornalConfig;
}

let cache: JornalConfig | null = null;

/** Config carregada e validada (falha alto na primeira chamada se inválida). */
export function getConfig(): JornalConfig {
  if (!cache) cache = validarConfig(raw);
  return cache;
}

/** Leitor autorizado para o e-mail (sem diferenciar maiúsculas/minúsculas), ou null. */
export function leitorPorEmail(email: string | null | undefined, cfg: JornalConfig = getConfig()): Leitor | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return cfg.leitores.find((l) => l.email.trim().toLowerCase() === e) ?? null;
}

/** O e-mail está na lista de leitores? */
export function ehLeitor(email: string | null | undefined, cfg: JornalConfig = getConfig()): boolean {
  return leitorPorEmail(email, cfg) !== null;
}

/** Grupo de itens finalizados do quadro (o do próprio quadro, senão o global). */
export function grupoFinalizadasDoQuadro(qc: Pick<QuadroConfig, "grupo_finalizadas">, cfg: JornalConfig = getConfig()): string {
  return qc.grupo_finalizadas ?? cfg.grupo_finalizadas;
}

/** Gestor que responde por uma área (título do grupo ou rótulo da coluna Área), ou null. */
export function gestorDaArea(area: string | null | undefined, cfg: JornalConfig = getConfig()): string | null {
  if (!area) return null;
  const a = area.trim();
  return cfg.gestores.find((g) => g.area === a)?.nome ?? null;
}

/** Área curta do gestor ("Controladoria"), ou null se o nome não está no config (ex.: "Sem área"). */
export function areaCurta(nome: string | null | undefined, cfg: JornalConfig = getConfig()): string | null {
  return cfg.gestores.find((g) => g.nome === nome)?.area_curta ?? null;
}
