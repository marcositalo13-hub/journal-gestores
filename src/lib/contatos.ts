// WhatsApp dos gestores: normalização e validação. Puro e sem imports (serve também ao cliente).

/**
 * Só dígitos; com 10 ou 11 dígitos (DDD + número) acrescenta o 55. Aceita só 12 ou 13 dígitos; senão null.
 * "(61) 99999-9999" → "5561999999999"; "+55 (61) 9 9999-9999" → "5561999999999".
 */
export function normalizarWhatsapp(entrada: string): string | null {
  let d = entrada.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^\d{12,13}$/.test(d) ? d : null;
}

/** "5561999999999" → "(61) 99999-9999" (para preencher o campo ao editar); fora do padrão, devolve como veio. */
export function formatarWhatsapp(numero: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(numero);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : numero;
}
