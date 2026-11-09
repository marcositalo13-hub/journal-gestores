// Monta o texto de uma notificação. Puro. Regra do projeto: NUNCA há valores monetários no texto.
export interface EntradaNotificacao {
  titulo: string;
  corpo: string;
  /** mesma tag = a notificação nova substitui a anterior (eventos repetidos não empilham) */
  tag: string;
  /** caminho interno aberto ao tocar (padrão "/") */
  url?: string;
}

// "R$ 10", "R$10.000,00", "10.000,00", "1,50": qualquer cara de valor em dinheiro.
const PARECE_VALOR = /R\$|\d[\d.]*,\d{2}\b/i;

export function temValor(texto: string): boolean {
  return PARECE_VALOR.test(texto);
}

/** Remove o que parece valor em dinheiro de um texto vindo do monday (ex.: nome de item "Aluguel R$ 12.000,00"). */
export function limparValores(texto: string): string {
  return texto
    .replace(/R\$\s*[\d.,]*/gi, "")
    .replace(/\d[\d.]*,\d{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([·,:;)])/g, "$1")
    .trim();
}

/** JSON do payload (title, body, tag, url). Recusa texto com valores e URLs que não sejam caminhos internos. */
export function montarPayload({ titulo, corpo, tag, url = "/" }: EntradaNotificacao): string {
  if (temValor(titulo) || temValor(corpo)) throw new Error("O texto da notificação não pode conter valores monetários.");
  if (!tag.trim()) throw new Error("A notificação precisa de uma tag.");
  if (!url.startsWith("/") || url.startsWith("//")) throw new Error("A URL da notificação deve ser um caminho interno.");
  return JSON.stringify({ title: titulo, body: corpo, tag, url });
}

export const NOTIFICACAO_TESTE: EntradaNotificacao = {
  titulo: "A Pauta",
  corpo: "Notificações ativadas. Você receberá avisos importantes por aqui.",
  tag: "teste",
  url: "/",
};
