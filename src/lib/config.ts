import raw from "../../config/jornal.config.json";

export type TipoQuadro = "atividades" | "pagamentos";
export type TipoColuna = "status" | "date" | "dropdown" | "text" | "numbers";
export type AjusteDiaNaoUtil = "manter_e_avisar" | "dia_util_mais_proximo";

export interface Leitor {
  email: string;
  nome: string;
}

export interface Manchete {
  /** valor (R$) a partir do qual um pagamento pode virar manchete */
  pagamento_relevante_a_partir_de: number;
  pagamento_antecedencia_dias: number;
  contrato_antecedencia_dias: number;
}

export interface Gestor {
  nome: string;
  area: string;
  reporta_a: string;
  quadro_id: string | null;
}

export interface QuadroConfig {
  id: string;
  tipo: TipoQuadro;
  dono: string;
}

export interface TipoQuadroConfig {
  data: string;
  status: string;
  colunas: Record<string, TipoColuna>;
  obrigatorias: string[];
  status_concluido: string;
  status_travado: string;
  status_cancelado: string;
  status_inicial: string;
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
  formato_grupo_mes: string;
  tipos_de_quadro: Record<TipoQuadro, TipoQuadroConfig>;
  empate_dia_util: "anterior" | "posterior";
  considerar_facultativos_como_nao_util: boolean;
  manchete: Manchete;
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

  ["timezone", "workspace_id", "diretor", "grupo_cadastro", "formato_grupo_mes"].forEach(str);

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
    for (const k of ["nome", "area", "reporta_a"]) {
      if (typeof x?.[k] !== "string") erros.push(`gestores[${i}].${k} deve ser string`);
    }
    if (!(x?.quadro_id === null || typeof x?.quadro_id === "string")) erros.push(`gestores[${i}].quadro_id deve ser string ou null`);
  });

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
    for (const k of ["status_concluido", "status_travado", "status_cancelado", "status_inicial"]) {
      if (typeof x[k] !== "string") erros.push(`${p}.${k} deve ser string`);
    }
    if (!Array.isArray(x.obrigatorias)) erros.push(`${p}.obrigatorias deve ser array`);
    else
      for (const ob of x.obrigatorias) {
        if (typeof ob !== "string" || !(ob in colunas)) erros.push(`${p}.obrigatorias: "${String(ob)}" não está em colunas`);
      }
    for (const k of ["Recorrência", "Chave"]) {
      if (!(k in colunas)) erros.push(`${p}.colunas deve incluir "${k}"`);
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
    num("pagamento_relevante_a_partir_de", false);
    num("pagamento_antecedencia_dias", true);
    num("contrato_antecedencia_dias", true);
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
