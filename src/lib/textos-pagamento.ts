// Textos da autorização de pagamentos na interface. Puros e sem config: rodam no browser.
import { moeda } from "./formato";

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** "Autorizar Aluguel da sede — R$ 80.000,00 — vence 13/11?" (o valor aparece sempre, mesmo com "ocultar valores") */
export function perguntaAutorizacao(item: { nome: string; valor?: number; data: string | null }): string {
  const valor = typeof item.valor === "number" ? ` — ${moeda(item.valor)}` : "";
  const venc = item.data ? ` — vence ${ddmm(item.data)}` : " — sem vencimento";
  return `Autorizar ${item.nome}${valor}${venc}?`;
}

/** "Autorizado por Egídio em 10/11" (encolhe se faltar o nome ou a data) */
export function textoAutorizado(i: { autorizadoPor?: string; autorizadoEm?: string }): string {
  return `Autorizado${i.autorizadoPor ? ` por ${i.autorizadoPor}` : ""}${i.autorizadoEm ? ` em ${ddmm(i.autorizadoEm)}` : ""}`;
}
