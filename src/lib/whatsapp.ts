// Mensagens e links de acompanhamento por WhatsApp. Puro, sem config.
// As funções de mensagem recebem SÓ nome, tipo e data do item: nunca há como o valor entrar no texto.

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

/** "2026-10-09" → "09/10" */
function ddmm(d: string): string {
  const [, m, dia] = d.split("-");
  return `${dia}/${m}`;
}

export interface ItemParaMensagem {
  nome: string;
  tipo: string;
  /** YYYY-MM-DD ou null (item sem prazo) */
  data: string | null;
  /** só para itens sem prazo: "regra_sem_data" = recorrência sem data inicial */
  motivo?: string;
}

export function mensagemItem(item: ItemParaMensagem, primeiro: string): string {
  if (item.data === null) {
    return item.motivo === "regra_sem_data"
      ? `Olá, ${primeiro}. Qual é a data da primeira entrega de "${item.nome}"? Sem ela, a recorrência não aparece no painel.`
      : `Olá, ${primeiro}. Qual é o prazo de "${item.nome}"?`;
  }
  return item.data
    ? `Olá, ${primeiro}. Sobre "${item.nome}" (prazo ${ddmm(item.data)}): qual é a situação?`
    : `Olá, ${primeiro}. Sobre "${item.nome}": qual é a situação?`;
}

export function mensagemCaderno(primeiro: string): string {
  return `Olá, ${primeiro}. Pode me passar a situação das suas pendências?`;
}

/** https://wa.me/{dígitos}?text={mensagem codificada}. `numero`: só dígitos, com código do país. */
export function urlWhatsapp(numero: string, mensagem: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
