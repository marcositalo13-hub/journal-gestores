// Níveis de urgência dos itens. Funções puras: tudo entra por argumento (item, hoje, config).
// Dias úteis vêm de calendario.ts (fins de semana, feriados e, se configurado, facultativos).
import { diasEntre, ehDiaUtil, proximoDiaUtil, somarDias, type DataISO } from "../calendario";
import type { JornalConfig } from "../config";
import { piorNivel, type Nivel } from "../niveis";
import { textoSemPrazo, type MotivoSemPrazo } from "../sem-prazo";
import type { ItemEdicao } from "./itens";

export type { Nivel };

type ItemUrgencia = Pick<ItemEdicao, "categoria" | "data"> & { tipoQuadro?: string; motivo?: MotivoSemPrazo };

/** Último dia da janela de atenção: o N-ésimo dia útil depois de hoje. */
export function limiteDeAtencao(hoje: DataISO, cfg: JornalConfig): DataISO {
  let d = hoje;
  for (let k = 0; k < cfg.urgencia.atencao_dias_uteis; k++) d = proximoDiaUtil(d, cfg);
  return d;
}

/**
 * Nível de urgência de um item:
 * concluído → verde; cancelado → nenhum; prazo antes de hoje (e não concluído) → preto;
 * travado → vermelho; prazo hoje → vermelho; sem prazo → amarelo;
 * prazo dentro dos próximos N dias úteis → amarelo; senão verde.
 */
export function nivelUrgencia(item: ItemUrgencia, hoje: DataISO, cfg: JornalConfig): Nivel | null {
  if (item.categoria === "concluido") return "verde";
  if (item.categoria === "cancelado") return null;
  if (item.data !== null && item.data < hoje) return "preto";
  if (item.categoria === "travado") return "vermelho";
  if (item.data === hoje) return "vermelho";
  if (item.data === null) return "amarelo";
  return item.data <= limiteDeAtencao(hoje, cfg) ? "amarelo" : "verde";
}

const dia = (n: number) => (n === 1 ? "dia" : "dias");

/** Dias úteis em (hoje, d]. */
function diasUteisAte(hoje: DataISO, d: DataISO, cfg: JornalConfig): number {
  let n = 0;
  for (let x = somarDias(hoje, 1); x <= d; x = somarDias(x, 1)) if (ehDiaUtil(x, cfg)) n++;
  return n;
}

/**
 * Texto que acompanha a cor (a cor nunca é o único sinal):
 * "Atrasado há N dias", "Vence hoje", "Travado", "Amanhã", "Em N dias úteis", "Sem prazo", "Em dia", "Concluído" (pagamentos: "Pago").
 */
export function rotuloUrgencia(item: ItemUrgencia, hoje: DataISO, cfg: JornalConfig): string | null {
  const nivel = nivelUrgencia(item, hoje, cfg);
  if (nivel === null) return null;
  if (item.categoria === "concluido") return item.tipoQuadro === "pagamentos" ? "Pago" : "Concluído";
  if (nivel === "preto" && item.data !== null) {
    const n = diasEntre(item.data, hoje);
    return `Atrasado há ${n} ${dia(n)}`;
  }
  if (item.categoria === "travado") return "Travado";
  if (item.data === hoje) return "Vence hoje";
  if (item.data === null) return textoSemPrazo(item.motivo);
  if (nivel === "amarelo") {
    if (diasEntre(hoje, item.data) === 1) return "Amanhã";
    const n = diasUteisAte(hoje, item.data, cfg);
    return n > 0 ? `Em ${n} ${n === 1 ? "dia útil" : "dias úteis"}` : `Em ${diasEntre(hoje, item.data)} dias`;
  }
  return "Em dia";
}

export interface Urgencia {
  nivel: Nivel | null;
  rotulo: string | null;
}

export const urgenciaDoItem = (item: ItemUrgencia, hoje: DataISO, cfg: JornalConfig): Urgencia => ({
  nivel: nivelUrgencia(item, hoje, cfg),
  rotulo: rotuloUrgencia(item, hoje, cfg),
});

/** O pior nível entre itens ainda abertos (preto > vermelho > amarelo); null se tudo estiver verde ou não houver itens. */
export function piorNivelAberto(itens: Pick<ItemEdicao, "categoria" | "data">[], hoje: DataISO, cfg: JornalConfig): Exclude<Nivel, "verde"> | null {
  const abertos = itens.filter((i) => i.categoria === "aberto" || i.categoria === "travado");
  const pior = piorNivel(abertos.map((i) => nivelUrgencia(i, hoje, cfg)));
  return pior === "verde" ? null : pior;
}

export interface RegraLegenda {
  nivel: Nivel;
  titulo: string;
  regra: string;
}

/** Texto da legenda, gerado dos valores da config (nunca digitado à mão). */
export function textosLegenda(cfg: JornalConfig): RegraLegenda[] {
  const n = cfg.urgencia.atencao_dias_uteis;
  const uteis = `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
  return [
    { nivel: "preto", titulo: "Atrasado", regra: "O prazo já passou e o item não foi concluído." },
    { nivel: "vermelho", titulo: "Hoje ou travado", regra: "O prazo é hoje, ou o item está travado." },
    { nivel: "amarelo", titulo: "Atenção", regra: `O prazo vence nos próximos ${uteis}, ou o item está sem prazo.` },
    { nivel: "verde", titulo: "Em dia", regra: `O prazo está a mais de ${uteis}, ou o item já foi concluído (pagamentos: pago).` },
  ];
}

