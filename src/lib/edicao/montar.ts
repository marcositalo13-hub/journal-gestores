// Monta as seções da edição diária. Função pura: tudo entra por argumento (itens, hoje, config).
import { diasEntre, ehDiaUtil, proximoDiaUtil, rotuloDia, somarDias, type DataISO } from "../calendario";
import type { JornalConfig } from "../config";
import type { ItemEdicao, ItemJornal, ItemSemPrazo } from "./itens";
import { ORDEM_NIVEL } from "../niveis";
import { nivelUrgencia, piorNivelAberto, type Nivel } from "./urgencia";

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

export type RegraManchete = "pendencia" | "travado" | "contrato" | "hoje" | "proximo";

export interface MancheteEdicao {
  item: ItemEdicao;
  motivo: string;
  regra: RegraManchete;
  nivel: Exclude<Nivel, "verde">;
  /** chamada factual acima do título: "Contrato · vence hoje", "Atrasado há 3 dias", "Travado" */
  kicker: string;
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
  /** o pior nível entre os itens abertos do gestor (null: tudo em dia) */
  nivel: Exclude<Nivel, "verde"> | null;
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

function quando(dias: number): string {
  return dias === 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`;
}

/** Kicker do contrato (dias corridos): "Contrato · vence hoje" | "Contrato · prazo amanhã" | "Contrato · prazo em N dias". */
export function kickerContrato(dias: number): string {
  return dias <= 0 ? "Contrato · vence hoje" : dias === 1 ? "Contrato · prazo amanhã" : `Contrato · prazo em ${dias} dias`;
}

/** Kicker da pendência: "Atrasado há 1 dia" / "Atrasado há N dias". */
export function kickerPendencia(dias: number): string {
  return `Atrasado há ${dias} ${dias === 1 ? "dia" : "dias"}`;
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

/** Kicker de quem não é atrasado nem travado nem contrato: "Vence hoje" / "Prazo amanhã" / "Prazo em N dias". */
export function kickerPrazo(dias: number): string {
  return dias <= 0 ? "Vence hoje" : dias === 1 ? "Prazo amanhã" : `Prazo em ${dias} dias`;
}

/**
 * Manchete = o item aberto com o pior nível de urgência (preto > vermelho > amarelo). Desempate dentro do nível:
 * Contrato primeiro; depois a data mais antiga (preto) ou a mais próxima (demais); depois o nome.
 * Itens sem prazo só concorrem se estiverem travados. Pagamentos não entram (já fora de `itens`).
 */
function escolherManchete(itens: ItemJornal[], semPrazo: ItemSemPrazo[], hoje: DataISO, cfg: JornalConfig): MancheteEdicao | null {
  const candidatos = [...itens, ...semPrazo.filter((i) => i.categoria === "travado")]
    .filter(aberto)
    .map((item) => ({ item, nivel: nivelUrgencia(item, hoje, cfg) }))
    .filter((c): c is { item: ItemEdicao; nivel: Exclude<Nivel, "verde"> } => c.nivel !== null && c.nivel !== "verde");
  if (!candidatos.length) return null;

  const ordem = (n: Nivel) => ORDEM_NIVEL.indexOf(n);
  candidatos.sort(
    (a, b) =>
      ordem(a.nivel) - ordem(b.nivel) ||
      Number(b.item.tipo === "Contrato") - Number(a.item.tipo === "Contrato") ||
      (a.item.data === null ? 1 : 0) - (b.item.data === null ? 1 : 0) ||
      (a.item.data ?? "").localeCompare(b.item.data ?? "") || // preto: mais antiga; demais: mais próxima (ambos crescentes)
      a.item.nome.localeCompare(b.item.nome, "pt-BR"),
  );
  const { item, nivel } = candidatos[0];

  if (nivel === "preto" && item.data !== null) {
    const dias = diasEntre(item.data, hoje);
    return { item, nivel, regra: "pendencia", motivo: `Atrasado há ${dias} ${dias === 1 ? "dia" : "dias"}.`, kicker: kickerPendencia(dias) };
  }
  if (item.categoria === "travado") return { item, nivel, regra: "travado", motivo: item.observacao ?? "Item travado, sem motivo informado.", kicker: "Travado" };
  const dias = diasEntre(hoje, item.data as DataISO);
  if (item.tipo === "Contrato") return { item, nivel, regra: "contrato", motivo: `Contrato com prazo ${quando(dias)}.`, kicker: kickerContrato(dias) };
  return { item, nivel, regra: dias <= 0 ? "hoje" : "proximo", motivo: `Prazo ${quando(dias)}.`, kicker: kickerPrazo(dias) };
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
      nivel: piorNivelAberto([...meus, ...meusSemPrazo], hoje, cfg),
    };
  };
  return [...cfg.gestores.map((g) => resumo(g.nome, g.area, g.reporta_a)), ...extras.map((d) => resumo(d, null, null))];
}

/**
 * @param itens   todos os itens lidos (cancelados são descartados aqui)
 * @param hoje    data da edição (YYYY-MM-DD, São Paulo)
 * @param geradoEm instante da leitura dos dados (ISO)
 */
/** Pagamentos vivem na aba própria: nunca entram em edição, cadernos nem contagens de atividades. */
export const ehAtividade = (i: Pick<ItemJornal, "tipoQuadro">) => i.tipoQuadro !== "pagamentos";

export function montarEdicao(itensBrutos: ItemJornal[], hoje: DataISO, cfg: JornalConfig, geradoEm: string, semPrazoBruto: ItemSemPrazo[] = []): Edicao {
  const itens = itensBrutos.filter((i) => i.categoria !== "cancelado" && ehAtividade(i));
  // sem prazo: só o que ainda exige ação (aberto/travado); cancelados e concluídos não precisam de data
  const semPrazo = semPrazoBruto.filter(ehAtividade).filter(aberto).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

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
    manchete: escolherManchete(itens, semPrazo, hoje, cfg),
    gestores: resumirGestores(itens, semPrazo, hoje, cfg),
  };
}
