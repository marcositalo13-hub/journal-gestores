// Visão da aba Pagamentos: pagamentos que esperam a autorização do diretor e o histórico dos autorizados.
// Pura: tudo entra por argumento.
// Categorias (config): "Aguardando autorização" = aberto, "Autorizado" = concluído, "Cancelado" = cancelado.
import { diasEntre, nomeDoMes, type DataISO } from "../calendario";
import type { JornalConfig } from "../config";
import { moeda } from "../formato";
import type { ItemEdicao } from "./itens";

export const MOTIVO_AREA = "Área subordinada";

/** "R$ 100 mil" para múltiplos de mil; senão o valor por extenso ("R$ 99.999,99"). */
export function textoLimite(valor: number): string {
  return valor >= 1000 && valor % 1000 === 0 ? `R$ ${new Intl.NumberFormat("pt-BR").format(valor / 1000)} mil` : moeda(valor);
}

/**
 * Por que o pagamento chega ao diretor: valor a partir do limite do config → "Acima de R$ 100 mil";
 * abaixo disso → "Área subordinada". O limite é inclusivo (R$ 100.000,00 já é "Acima de").
 */
export function motivoAprovacao(valor: number, cfg: JornalConfig): string {
  const limite = cfg.pagamentos.aprovacao_diretor_a_partir_de;
  return valor >= limite ? `Acima de ${textoLimite(limite)}` : MOTIVO_AREA;
}

/** Prazo em dias corridos até o vencimento: "Vence hoje" | "Amanhã" | "Em N dias" | "Venceu há N dias". */
export function rotuloVencimento(dias: number): string {
  if (dias < 0) {
    const n = -dias;
    return `Venceu há ${n} ${n === 1 ? "dia" : "dias"}`;
  }
  return dias === 0 ? "Vence hoje" : dias === 1 ? "Amanhã" : `Em ${dias} dias`;
}

export interface PagamentoAguardando {
  item: ItemEdicao;
  /** dias corridos até o vencimento (negativo = vencido); null sem Vencimento */
  dias: number | null;
  /** "Vence hoje", "Amanhã", "Em N dias", "Venceu há N dias" ou "Sem vencimento" */
  rotulo: string;
}

export interface Pagamentos {
  data: DataISO;
  aguardando: {
    /** vencimento mais antigo primeiro; sem Vencimento por último */
    itens: PagamentoAguardando[];
    quantidade: number;
    /** soma dos valores (item sem Valor conta zero) */
    total: number;
  };
  /** autorizados (dos dois grupos do quadro), por mês de "Autorizado em", o mais recente primeiro */
  autorizados: MesAutorizados[];
}

export interface MesAutorizados {
  /** "2026-11"; "sem-data" para autorizados sem "Autorizado em" (sempre por último) */
  chave: string;
  /** "Novembro de 2026" | "Sem data de autorização" */
  rotulo: string;
  itens: ItemEdicao[];
}

export const SEM_DATA_AUTORIZACAO = "sem-data";

/** Autorizados agrupados pelo mês de "Autorizado em" (mais recente primeiro); dentro do mês, o mais recente primeiro. */
export function agruparAutorizados(itens: ItemEdicao[]): MesAutorizados[] {
  const grupos = new Map<string, ItemEdicao[]>();
  for (const i of itens) {
    const k = i.autorizadoEm ? i.autorizadoEm.slice(0, 7) : SEM_DATA_AUTORIZACAO;
    grupos.set(k, [...(grupos.get(k) ?? []), i]);
  }
  const ordem = (k: string) => (k === SEM_DATA_AUTORIZACAO ? "" : k);
  return [...grupos]
    .sort(([a], [b]) => ordem(b).localeCompare(ordem(a)))
    .map(([chave, doMes]) => ({
      chave,
      rotulo: chave === SEM_DATA_AUTORIZACAO ? "Sem data de autorização" : `${nomeDoMes(Number(chave.slice(5, 7)))} de ${chave.slice(0, 4)}`,
      itens: doMes.sort((a, b) => (b.autorizadoEm ?? "").localeCompare(a.autorizadoEm ?? "") || porNome(a, b)),
    }));
}

const centavos = (n: number) => Math.round(n * 100) / 100;
const porNome = (a: ItemEdicao, b: ItemEdicao) => a.nome.localeCompare(b.nome, "pt-BR");

/** Só considera itens de quadros de pagamentos; cancelados nunca aparecem. */
export function montarPagamentos(itensBrutos: ItemEdicao[], hoje: DataISO): Pagamentos {
  const itens = itensBrutos.filter((i) => i.tipoQuadro === "pagamentos");

  const aguardando = itens
    .filter((i) => i.categoria === "aberto")
    .sort((a, b) => (a.data === null ? 1 : 0) - (b.data === null ? 1 : 0) || (a.data ?? "").localeCompare(b.data ?? "") || porNome(a, b))
    .map((item): PagamentoAguardando => {
      const dias = item.data === null ? null : diasEntre(hoje, item.data);
      return { item, dias, rotulo: dias === null ? "Sem vencimento" : rotuloVencimento(dias) };
    });

  return {
    data: hoje,
    aguardando: { itens: aguardando, quantidade: aguardando.length, total: centavos(aguardando.reduce((t, p) => t + (p.item.valor ?? 0), 0)) },
    autorizados: agruparAutorizados(itens.filter((i) => i.categoria === "concluido")),
  };
}
