// Helpers de data PUROS (sem config). Existem separados do calendário para que componentes do
// browser (via formato.ts) não puxem o config.json — com e-mails e WhatsApp — para o JavaScript público.
export type DataISO = string;

export function partes(d: DataISO): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`Data inválida (esperado YYYY-MM-DD): ${d}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** 0 = domingo ... 6 = sábado */
export function diaDaSemana(d: DataISO): number {
  const [y, m, day] = partes(d);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}
