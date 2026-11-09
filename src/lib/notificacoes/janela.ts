// Janela de envio (horário de São Paulo). Puro.
import { horaMinuto } from "../calendario";
import type { JornalConfig } from "../config";

const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Minutos desde a meia-noite em São Paulo. */
function minutoDoDia(agora: Date, cfg: JornalConfig): number {
  const { h, m } = horaMinuto(agora, cfg);
  return h * 60 + m;
}

/** Dentro de [janela_inicio, janela_fim], extremos incluídos (07:00 e 20:00 entram; 06:59 e 20:01 não). */
export function dentroDaJanela(agora: Date, cfg: JornalConfig): boolean {
  const t = minutoDoDia(agora, cfg);
  return t >= minutos(cfg.notificacoes.janela_inicio) && t <= minutos(cfg.notificacoes.janela_fim);
}

/** Instante (Date) do início da janela de HOJE em São Paulo. O que entrou na fila antes disso é "da noite". */
export function inicioDaJanelaDeHoje(agora: Date, cfg: JornalConfig): Date {
  const doMinuto = Math.floor(agora.getTime() / 60_000) * 60_000;
  return new Date(doMinuto - (minutoDoDia(agora, cfg) - minutos(cfg.notificacoes.janela_inicio)) * 60_000);
}
