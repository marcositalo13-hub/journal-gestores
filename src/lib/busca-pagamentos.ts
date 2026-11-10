// Busca no histórico de pagamentos autorizados. Pura e sem config: roda no browser.
// Texto: sem acento e sem diferença de maiúsculas, no nome e na observação.
// Números: "120000", "120.000", "120.000,00" ou "120000,5" casam com o valor (parcial vale: "120" acha 120.000).

/** "Conciliação  BRB" → "conciliacao brb" */
export function normalizarBusca(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** O termo parece um valor em reais? ("120000", "120.000", "R$ 120.000,00", "1.500,5") */
const NUMERO = /^\d[\d.]*(,\d{0,2})?$/;

/** O valor casa com o termo numérico. Sem vírgula: os dígitos da parte inteira contêm os digitados. */
export function casaValor(valor: number | undefined, termo: string): boolean {
  if (typeof valor !== "number") return false;
  const t = termo.replace(/r\$|\s/gi, "");
  if (!NUMERO.test(t)) return false;
  const [inteiro, decimal] = t.replace(/\./g, "").split(",");
  const [vi, vd] = Math.abs(valor).toFixed(2).split(".");
  if (decimal === undefined) return vi.includes(inteiro);
  return vi === inteiro && vd.startsWith(decimal);
}

export interface ItemBuscavel {
  nome: string;
  observacao?: string;
  valor?: number;
}

/** Busca vazia casa com tudo. */
export function casaBusca(item: ItemBuscavel, busca: string): boolean {
  const q = normalizarBusca(busca);
  if (!q) return true;
  if (normalizarBusca(item.nome).includes(q) || normalizarBusca(item.observacao).includes(q)) return true;
  return casaValor(item.valor, busca.trim());
}

/** Filtra os grupos (meses) pela busca; grupos que ficam vazios somem. */
export function filtrarGrupos<G extends { itens: I[] }, I extends ItemBuscavel>(grupos: G[], busca: string): G[] {
  return grupos.map((g) => ({ ...g, itens: g.itens.filter((i) => casaBusca(i, busca)) })).filter((g) => g.itens.length > 0);
}
