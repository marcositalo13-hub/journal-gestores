// Monta as seções da edição diária. Função pura: tudo entra por argumento (itens, hoje, config).
import { diasEntre, ehDiaUtil, proximoDiaUtil, rotuloDia, somarDias, type DataISO } from "../calendario";
import type { JornalConfig } from "../config";
import type { ItemEdicao, ItemJornal, ItemSemPrazo } from "./itens";

export interface ItemPendencia {
  item: ItemJornal;
  /** dias corridos desde o prazo */
  diasAtraso: number;
}

export interface ItemTravado {
  /** pode não ter data (ItemSemPrazo): um travado sem prazo continua aparecendo */
  item: ItemEdicao;
  /** observação do item (campo de motivo) */
  motivo: string | null;
  // TODO: calcular dias travado quando houver histórico diário (hoje o monday só informa o status atual).
  diasTravado: number | null;
}

export interface AvisoNaoUtil {
  /** primeiro dia útil depois de hoje */
  proximoDiaUtil: DataISO;
  itens: { item: ItemJornal; rotulo: string }[];
}

export interface DiaSemana {
  data: DataISO;
  /** ex.: "qua. 07/10" */
  rotulo: string;
  ehDiaUtil: boolean;
  itens: ItemJornal[];
}

export type RegraManchete = "pagamento" | "contrato" | "pendencia" | "travado";

export interface MancheteEdicao {
  item: ItemEdicao;
  motivo: string;
  regra: RegraManchete;
}

export interface ResumoGestor {
  nome: string;
  /** null para um dono que não está em config.gestores (ex.: "TESTE") */
  area: string | null;
  reportaA: string | null;
  contagens: {
    /** com prazo hoje e ainda não concluídos */
    hoje: number;
    /** pendências atrasadas */
    atrasados: number;
    /** travados, de qualquer data */
    travados: number;
    /** itens em aberto/travados sem nenhuma data */
    semPrazo: number;
  };
  /** itens com data no mês corrente até hoje (sem cancelados) */
  mes: { concluidos: number; total: number };
}

export interface Edicao {
  /** data da edição (YYYY-MM-DD, São Paulo) */
  data: DataISO;
  /** quando os dados foram lidos do monday (ISO) */
  geradoEm: string;
  hoje: ItemJornal[];
  pendencias: ItemPendencia[];
  travados: ItemTravado[];
  /** itens em aberto/travados sem data (nem nos subitens): precisam de um prazo no monday */
  semPrazo: ItemSemPrazo[];
  avisoNaoUtil: AvisoNaoUtil | null;
  semana: DiaSemana[];
  manchete: MancheteEdicao | null;
  gestores: ResumoGestor[];
}

const aberto = (i: ItemEdicao) => i.categoria === "aberto" || i.categoria === "travado";
const porDataENome = (a: ItemJornal, b: ItemJornal) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR");

function brl(v: number): string {
  const f = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: Number.isInteger(v) ? 0 : 2 });
  return f.format(v).replace(/ /g, " ");
}

function quando(dias: number): string {
  return dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;
}

/** Nomes de todos abaixo de `nome` na hierarquia reporta_a (sem incluir `nome`). */
export function descendentes(nome: string, cfg: JornalConfig): string[] {
  const out: string[] = [];
  const vistos = new Set<string>([nome]);
  const fila = [nome];
  while (fila.length) {
    const atual = fila.shift()!;
    for (const g of cfg.gestores) {
      if (g.reporta_a === atual && !vistos.has(g.nome)) {
        vistos.add(g.nome);
        out.push(g.nome);
        fila.push(g.nome);
      }
    }
  }
  return out;
}

function escolherManchete(itens: ItemJornal[], pendencias: ItemPendencia[], travados: ItemTravado[], hoje: DataISO, cfg: JornalConfig): MancheteEdicao | null {
  const m = cfg.manchete;
  const naoConcluido = (i: ItemJornal) => i.categoria === "aberto" || i.categoria === "travado";

  // (a) pagamento relevante próximo do vencimento → maior valor
  const limPag = somarDias(hoje, m.pagamento_antecedencia_dias);
  const pagamentos = itens
    .filter((i) => i.tipo === "Pagamento" && naoConcluido(i) && (i.valor ?? 0) >= m.pagamento_relevante_a_partir_de && i.data >= hoje && i.data <= limPag)
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0) || porDataENome(a, b));
  if (pagamentos[0]) {
    const p = pagamentos[0];
    return { item: p, regra: "pagamento", motivo: `Pagamento de ${brl(p.valor ?? 0)} vence ${quando(diasEntre(hoje, p.data))}.` };
  }

  // (b) contrato próximo → o mais próximo
  const limCon = somarDias(hoje, m.contrato_antecedencia_dias);
  const contratos = itens.filter((i) => i.tipo === "Contrato" && naoConcluido(i) && i.data >= hoje && i.data <= limCon).sort(porDataENome);
  if (contratos[0]) {
    return { item: contratos[0], regra: "contrato", motivo: `Contrato com prazo ${quando(diasEntre(hoje, contratos[0].data))}.` };
  }

  // (c) pendência mais antiga
  if (pendencias[0]) {
    const { item, diasAtraso } = pendencias[0];
    return { item, regra: "pendencia", motivo: `Atrasado há ${diasAtraso} ${diasAtraso === 1 ? "dia" : "dias"}.` };
  }

  // (d) qualquer travado
  if (travados[0]) {
    return { item: travados[0].item, regra: "travado", motivo: travados[0].motivo ?? "Item travado, sem motivo informado." };
  }
  return null;
}

function resumirGestores(itens: ItemJornal[], semPrazo: ItemSemPrazo[], hoje: DataISO, cfg: JornalConfig): ResumoGestor[] {
  const inicioMes = `${hoje.slice(0, 8)}01`;
  const conhecidos = new Set(cfg.gestores.map((g) => g.nome));
  const extras = [...new Set([...itens, ...semPrazo].map((i) => i.dono))].filter((d) => !conhecidos.has(d));

  const resumo = (nome: string, area: string | null, reportaA: string | null): ResumoGestor => {
    const meus = itens.filter((i) => i.dono === nome);
    const meusSemPrazo = semPrazo.filter((i) => i.dono === nome);
    const mes = meus.filter((i) => i.data >= inicioMes && i.data <= hoje);
    return {
      nome,
      area,
      reportaA,
      contagens: {
        hoje: meus.filter((i) => i.data === hoje && aberto(i)).length,
        atrasados: meus.filter((i) => i.data < hoje && aberto(i)).length,
        travados: meus.filter((i) => i.categoria === "travado").length + meusSemPrazo.filter((i) => i.categoria === "travado").length,
        semPrazo: meusSemPrazo.length,
      },
      mes: { concluidos: mes.filter((i) => i.categoria === "concluido").length, total: mes.length },
    };
  };
  return [...cfg.gestores.map((g) => resumo(g.nome, g.area, g.reporta_a)), ...extras.map((d) => resumo(d, null, null))];
}

/**
 * @param itens   todos os itens lidos (cancelados são descartados aqui)
 * @param hoje    data da edição (YYYY-MM-DD, São Paulo)
 * @param geradoEm instante da leitura dos dados (ISO)
 */
export function montarEdicao(itensBrutos: ItemJornal[], hoje: DataISO, cfg: JornalConfig, geradoEm: string, semPrazoBruto: ItemSemPrazo[] = []): Edicao {
  const itens = itensBrutos.filter((i) => i.categoria !== "cancelado");
  // sem prazo: só o que ainda exige ação (aberto/travado); cancelados e concluídos não precisam de data
  const semPrazo = semPrazoBruto.filter(aberto).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const secaoHoje = itens
    .filter((i) => i.data === hoje)
    .sort((a, b) => Number(a.categoria === "concluido") - Number(b.categoria === "concluido") || a.nome.localeCompare(b.nome, "pt-BR"));

  const pendencias: ItemPendencia[] = itens
    .filter((i) => i.data < hoje && aberto(i))
    .sort(porDataENome)
    .map((item) => ({ item, diasAtraso: diasEntre(item.data, hoje) }));

  const travados: ItemTravado[] = [...itens, ...semPrazo]
    .filter((i) => i.categoria === "travado")
    .sort((a, b) => (a.data === null ? 1 : 0) - (b.data === null ? 1 : 0) || (a.data ?? "").localeCompare(b.data ?? "") || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((item) => ({ item, motivo: item.observacao ?? null, diasTravado: null }));

  let avisoNaoUtil: AvisoNaoUtil | null = null;
  if (ehDiaUtil(hoje, cfg) && !ehDiaUtil(somarDias(hoje, 1), cfg)) {
    const prox = proximoDiaUtil(hoje, cfg);
    const lista = itens
      .filter((i) => i.data > hoje && i.data < prox && aberto(i))
      .sort(porDataENome)
      .map((item) => ({ item, rotulo: rotuloDia(item.data) }));
    if (lista.length) avisoNaoUtil = { proximoDiaUtil: prox, itens: lista };
  }

  const semana: DiaSemana[] = Array.from({ length: 7 }, (_, k) => {
    const data = somarDias(hoje, k + 1);
    return { data, rotulo: rotuloDia(data), ehDiaUtil: ehDiaUtil(data, cfg), itens: itens.filter((i) => i.data === data && aberto(i)).sort(porDataENome) };
  });

  return {
    data: hoje,
    geradoEm,
    hoje: secaoHoje,
    pendencias,
    travados,
    semPrazo,
    avisoNaoUtil,
    semana,
    manchete: escolherManchete(itens, pendencias, travados, hoje, cfg),
    gestores: resumirGestores(itens, semPrazo, hoje, cfg),
  };
}
