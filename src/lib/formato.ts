// Formatação PT-BR para a interface. Funções puras.
import { diaDaSemana, partes, type DataISO } from "./datas";

const SEMANA_ABREV = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];
const SEMANA_INICIAL = ["D", "S", "T", "Q", "Q", "S", "S"];
const MES_ABREV = ["jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez."];

/** "R$ 80.000,00" (espaço normal, não o NBSP do Intl). */
export function moeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor).replace(/\u00a0/g, " ");
}

/** "sex., 9 de out." */
export function dataCurta(d: DataISO): string {
  const [, m, dia] = partes(d);
  return `${SEMANA_ABREV[diaDaSemana(d)]}, ${dia} de ${MES_ABREV[m - 1]}`;
}

/** Inicial do dia da semana ("D", "S", "T"...). */
export function inicialDoDia(d: DataISO): string {
  return SEMANA_INICIAL[diaDaSemana(d)];
}

/** Número do dia do mês, sem zero à esquerda. */
export function numeroDoDia(d: DataISO): number {
  return partes(d)[2];
}

export function plural(n: number, singular: string, pluralForma: string): string {
  return n === 1 ? singular : pluralForma;
}

/** "1 item" / "3 itens" */
export function contagem(n: number, singular: string, pluralForma: string): string {
  return `${n} ${plural(n, singular, pluralForma)}`;
}

/** "há 1 dia" / "há 5 dias" */
export function haDias(n: number): string {
  return `há ${contagem(n, "dia", "dias")}`;
}

/** "vence hoje" / "vence amanhã" / "vence em 3 dias" */
export function venceEm(dias: number): string {
  return dias <= 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias} dias`;
}

/** "1 de 3 etapas" / "0 de 1 etapa" */
export function etapasTexto(e: { total: number; concluidas: number }): string {
  return `${e.concluidas} de ${e.total} ${plural(e.total, "etapa", "etapas")}`;
}

/** "2 itens sem prazo" */
export function semPrazoTexto(n: number): string {
  return `${contagem(n, "item", "itens")} sem prazo`;
}

const SEMANA_CURTA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MES_EXTENSO = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Sexta, 9 de outubro" (título da lista de um dia). */
export function dataTitulo(d: DataISO): string {
  const [, m, dia] = partes(d);
  return `${SEMANA_CURTA[diaDaSemana(d)]}, ${dia} de ${MES_EXTENSO[m - 1]}`;
}
