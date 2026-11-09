// O que enviar agora, dada a fila pendente. Puro.
import type { JornalConfig } from "../config";
import type { Prioridade } from "./regras";

export interface Pendente {
  id: string;
  prioridade: Prioridade;
  titulo: string;
  corpo: string;
  url: string;
  item_id: string;
  criado_em: string;
}

export interface Envio {
  titulo: string;
  corpo: string;
  /** mesma tag = o iPhone substitui em vez de empilhar */
  tag: string;
  url: string;
  /** linhas da fila cobertas por este envio */
  ids: string[];
}

/** "Área: Nome · prazo 13/11" → "Nome" (os corpos são sempre "{prefixo}: {nome}[ · prazo dd/mm]"). */
export function nomeDoCorpo(corpo: string): string {
  const i = corpo.indexOf(": ");
  return (i >= 0 ? corpo.slice(i + 2) : corpo).replace(/ · prazo \d{2}\/\d{2}$/, "");
}

const individual = (p: Pendente): Envio => ({ titulo: p.titulo, corpo: p.corpo, tag: `item-${p.item_id}`, url: p.url, ids: [p.id] });

/** Várias novidades num envio só: "{n} novidades" e até 3 linhas "{título}: {nome}" + "e mais {k}". */
export function agrupar(ps: Pendente[]): Envio {
  if (ps.length === 1) return individual(ps[0]);
  const linhas = ps.slice(0, 3).map((p) => `${p.titulo}: ${nomeDoCorpo(p.corpo)}`);
  if (ps.length > 3) linhas.push(`e mais ${ps.length - 3}`);
  return { titulo: `${ps.length} novidades`, corpo: linhas.join("\n"), tag: "grupo", url: "/", ids: ps.map((p) => p.id) };
}

/**
 * Imediatas: uma notificação cada, sempre. Normais: um envio (individual ou agrupado) só se o último envio
 * normal foi há pelo menos `agrupar_minutos` (ou nunca houve).
 */
export function planejarEnvios(pendentes: Pendente[], ultimoNormal: Date | null, agora: Date, cfg: JornalConfig): Envio[] {
  const ordem = [...pendentes].sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const envios = ordem.filter((p) => p.prioridade === "imediata").map(individual);
  const normais = ordem.filter((p) => p.prioridade === "normal");
  const liberado = !ultimoNormal || agora.getTime() - ultimoNormal.getTime() >= cfg.notificacoes.agrupar_minutos * 60_000;
  if (normais.length && liberado) envios.push(agrupar(normais));
  return envios;
}

/** Resumo da manhã: só contagens. */
export function textoResumo(c: { hoje: number | null; atrasados: number | null; noite: number }): string {
  const p = (n: number, s: string, pl: string) => `${n} ${n === 1 ? s : pl}`;
  const partes: string[] = [];
  if (c.hoje !== null) partes.push(p(c.hoje, "item hoje", "itens hoje"));
  if (c.atrasados !== null) partes.push(p(c.atrasados, "atrasado", "atrasados"));
  partes.push(p(c.noite, "novidade da noite", "novidades da noite"));
  return partes.join(" · ");
}
