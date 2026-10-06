// Todas as datas são strings "YYYY-MM-DD" no fuso de config.timezone.
// A aritmética usa Date em UTC apenas como calendário (sem horário), então não há deriva de fuso.
import { getConfig, type JornalConfig } from "./config";

export type DataISO = string;

const MESES_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function partes(d: DataISO): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Data inválida (esperado YYYY-MM-DD): ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function formatar(ano: number, mes: number, dia: number): DataISO {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Último dia do mês (mes 1–12). */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function somarDias(d: DataISO, n: number): DataISO {
  const [y, m, day] = partes(d);
  const dt = new Date(Date.UTC(y, m - 1, day + n));
  return formatar(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Soma meses mantendo o ano/mês; retorna [ano, mes] (mes 1–12). */
export function somarMeses(ano: number, mes: number, n: number): [number, number] {
  const total = ano * 12 + (mes - 1) + n;
  return [Math.floor(total / 12), (total % 12) + 1];
}

/** 0 = domingo ... 6 = sábado */
export function diaDaSemana(d: DataISO): number {
  const [y, m, day] = partes(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

export function nomeDoMes(mes: number): string {
  return MESES_PT[mes - 1];
}

/** Nome do grupo de mês (ex.: "Outubro 2026") conforme config.formato_grupo_mes. */
export function grupoDoMes(d: DataISO, cfg: JornalConfig = getConfig()): string {
  const [y, m] = partes(d);
  return cfg.formato_grupo_mes.replace("{Mes}", nomeDoMes(m)).replace("{AAAA}", String(y));
}

/** Data de hoje no fuso configurado. */
export function hoje(agora: Date = new Date(), cfg: JornalConfig = getConfig()): DataISO {
  return new Intl.DateTimeFormat("en-CA", { timeZone: cfg.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export function ehDiaUtil(d: DataISO, cfg: JornalConfig = getConfig()): boolean {
  const dow = diaDaSemana(d);
  if (dow === 0 || dow === 6) return false;
  if (cfg.feriados.includes(d)) return false;
  if (cfg.considerar_facultativos_como_nao_util && cfg.facultativos.includes(d)) return false;
  return true;
}

/** Dia útil mais próximo (o próprio d se já for útil). Empate resolvido por config.empate_dia_util. */
export function diaUtilMaisProximo(d: DataISO, cfg: JornalConfig = getConfig()): DataISO {
  if (ehDiaUtil(d, cfg)) return d;
  for (let k = 1; k <= 366; k++) {
    const antes = somarDias(d, -k);
    const depois = somarDias(d, k);
    const a = ehDiaUtil(antes, cfg);
    const p = ehDiaUtil(depois, cfg);
    if (a && p) return cfg.empate_dia_util === "anterior" ? antes : depois;
    if (a) return antes;
    if (p) return depois;
  }
  throw new Error(`Nenhum dia útil encontrado perto de ${d}`);
}

/** Último dia útil estritamente anterior a d. */
export function diaUtilAnterior(d: DataISO, cfg: JornalConfig = getConfig()): DataISO {
  for (let k = 1; k <= 366; k++) {
    const x = somarDias(d, -k);
    if (ehDiaUtil(x, cfg)) return x;
  }
  throw new Error(`Nenhum dia útil encontrado antes de ${d}`);
}

/** Aviso se a lista de feriados não cobre até hoje()+90 dias; null se estiver ok. */
export function coberturaCalendario(ref: DataISO = hoje(), cfg: JornalConfig = getConfig()): string | null {
  const limite = somarDias(ref, 90);
  const ultimo = [...cfg.feriados].sort().at(-1);
  if (!ultimo || ultimo < limite) {
    return `Feriados cadastrados vão só até ${ultimo ?? "(nenhum)"}; é preciso cobrir até ${limite} (hoje + 90 dias).`;
  }
  return null;
}

const DIAS_SEMANA_PT = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function nomeDiaDaSemana(d: DataISO): string {
  return DIAS_SEMANA_PT[diaDaSemana(d)];
}

/** "dd/mm" */
export function ddmm(d: DataISO): string {
  const [, m, day] = partes(d);
  return `${String(day).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Interpreta um título de grupo de mês ("Outubro 2026"); null se não for um nome válido. */
export function parseGrupoMes(titulo: string, cfg: JornalConfig = getConfig()): { ano: number; mes: number } | null {
  // Válido = exatamente o nome que grupoDoMes geraria para esse mês/ano.
  const ano = Number(/\d{4}/.exec(titulo)?.[0]);
  if (!ano) return null;
  for (let mes = 1; mes <= 12; mes++) {
    if (grupoDoMes(formatar(ano, mes, 1), cfg) === titulo.trim()) return { ano, mes };
  }
  return null;
}

/** Data por extenso em PT-BR, ex.: "Terça-feira, 6 de outubro de 2026". */
export function dataPorExtenso(d: DataISO): string {
  const [y, m, day] = partes(d);
  const dia = nomeDiaDaSemana(d);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${day} de ${nomeDoMes(m).toLowerCase()} de ${y}`;
}

/** Hora e minuto atuais no fuso configurado. */
export function horaMinuto(agora: Date = new Date(), cfg: JornalConfig = getConfig()): { h: number; m: number } {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: cfg.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(agora);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { h: n("hour"), m: n("minute") };
}

/** "Bom dia" antes das 12h, "Boa tarde" antes das 18h, senão "Boa noite". */
export function saudacao(hora: number): string {
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

/** "09h05" */
export function formatarHoraMinuto({ h, m }: { h: number; m: number }): string {
  return `${String(h).padStart(2, "0")}h${String(m).padStart(2, "0")}`;
}

/** Primeiro dia útil estritamente depois de d. */
export function proximoDiaUtil(d: DataISO, cfg: JornalConfig = getConfig()): DataISO {
  for (let k = 1; k <= 366; k++) {
    const x = somarDias(d, k);
    if (ehDiaUtil(x, cfg)) return x;
  }
  throw new Error(`Nenhum dia útil encontrado depois de ${d}`);
}

/** Dias corridos de a até b (negativo se b < a). */
export function diasEntre(a: DataISO, b: DataISO): number {
  const [ay, am, ad] = partes(a);
  const [by, bm, bd] = partes(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

const DIAS_ABREV_PT = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

/** Rótulo curto de um dia, ex.: "sáb. 10/10". */
export function rotuloDia(d: DataISO): string {
  return `${DIAS_ABREV_PT[diaDaSemana(d)]} ${ddmm(d)}`;
}
