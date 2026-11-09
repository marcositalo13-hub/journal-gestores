// Visão da aba Pagamentos. Pura: tudo entra por argumento. Só considera itens de quadros de pagamentos.
import { diasEntre, ehDiaUtil, formatar, nomeDoMes, partes, rotuloDia, somarDias, somarMeses, type DataISO } from "../calendario";
import type { JornalConfig } from "../config";
import type { ItemJornal } from "./itens";

/** Janela das saídas por data: de hoje até hoje + 45 dias (inclusive). */
export const DIAS_SAIDAS = 45;
export const QTD_MAIORES = 5;

export interface TotaisMes {
  /** "2026-11" */
  mes: string;
  /** "Novembro" */
  rotulo: string;
  /** soma dos pagamentos do mês, exceto cancelados */
  previsto: number;
  /** soma dos pagos */
  pago: number;
  /** previsto − pago */
  aPagar: number;
  /** quantidade de pagamentos não cancelados no mês */
  quantidade: number;
}

export interface SaidaDia {
  data: DataISO;
  /** "sex. 09/10" */
  rotulo: string;
  ehDiaUtil: boolean;
  total: number;
  itens: ItemJornal[];
}

export interface Pagamentos {
  data: DataISO;
  /** nenhum pagamento (não cancelado) lançado */
  vazio: boolean;
  mesAtual: TotaisMes;
  proximoMes: TotaisMes;
  /** vencimento < hoje, ainda não pagos nem cancelados; os mais antigos primeiro */
  atrasados: { item: ItemJornal; diasAtraso: number }[];
  /** próximos 45 dias: só o que ainda sai (aberto/travado), agrupado por data */
  saidasPorData: SaidaDia[];
  /** maiores valores do mês corrente (não cancelados) */
  maioresDoMes: ItemJornal[];
  travados: { item: ItemJornal; motivo: string | null }[];
}

const soma = (itens: ItemJornal[]) => Math.round(itens.reduce((t, i) => t + (i.valor ?? 0), 0) * 100) / 100;
const emAberto = (i: ItemJornal) => i.categoria === "aberto" || i.categoria === "travado";
const porDataENome = (a: ItemJornal, b: ItemJornal) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR");

function totaisDoMes(itens: ItemJornal[], ano: number, mes: number): TotaisMes {
  const chave = formatar(ano, mes, 1).slice(0, 7);
  const doMes = itens.filter((i) => i.data.startsWith(chave));
  const previsto = soma(doMes);
  const pago = soma(doMes.filter((i) => i.categoria === "concluido"));
  return { mes: chave, rotulo: nomeDoMes(mes), previsto, pago, aPagar: Math.round((previsto - pago) * 100) / 100, quantidade: doMes.length };
}

export function montarPagamentos(itensBrutos: ItemJornal[], hoje: DataISO, cfg: JornalConfig): Pagamentos {
  // não cancelados; ItemJornal de pagamentos vêm de quadros do tipo "pagamentos"
  const itens = itensBrutos.filter((i) => i.tipoQuadro === "pagamentos" && i.categoria !== "cancelado");
  const [ano, mes] = partes(hoje);
  const [anoProx, mesProx] = somarMeses(ano, mes, 1);
  const mesAtual = totaisDoMes(itens, ano, mes);

  const limite = somarDias(hoje, DIAS_SAIDAS);
  const porData = new Map<DataISO, ItemJornal[]>();
  for (const i of itens.filter((x) => emAberto(x) && x.data >= hoje && x.data <= limite).sort(porDataENome)) {
    porData.set(i.data, [...(porData.get(i.data) ?? []), i]);
  }

  return {
    data: hoje,
    vazio: itens.length === 0,
    mesAtual,
    proximoMes: totaisDoMes(itens, anoProx, mesProx),
    atrasados: itens
      .filter((i) => emAberto(i) && i.data < hoje)
      .sort(porDataENome)
      .map((item) => ({ item, diasAtraso: diasEntre(item.data, hoje) })),
    saidasPorData: [...porData].map(([data, doDia]) => ({ data, rotulo: rotuloDia(data), ehDiaUtil: ehDiaUtil(data, cfg), total: soma(doDia), itens: doDia })),
    maioresDoMes: itens
      .filter((i) => i.data.startsWith(mesAtual.mes))
      .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0) || porDataENome(a, b))
      .slice(0, QTD_MAIORES),
    travados: itens
      .filter((i) => i.categoria === "travado")
      .sort(porDataENome)
      .map((item) => ({ item, motivo: item.observacao ?? null })),
  };
}
