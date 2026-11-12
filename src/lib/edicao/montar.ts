// Monta as seções da edição diária. Função pura: tudo entra por argumento (itens, hoje, config).
import { diasEntre, ehDiaUtil, proximoDiaUtil, rotuloDia, somarDias, type DataISO } from "../calendario";
import { ehTipoAssinatura, type JornalConfig } from "../config";
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
  /** contratos abertos (não travados) com prazo em [hoje, hoje + manchete.contrato_antecedencia_dias]; atrasados ficam em pendencias */
  contratos: ItemJornal[];
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

/** Kicker de documento para assinatura (dias corridos), com o Tipo do próprio item: "Distrato · vence hoje" | "Distrato · prazo amanhã" | "Distrato · prazo em N dias". */
export function kickerAssinatura(tipo: string, dias: number): string {
  return dias <= 0 ? `${tipo} · vence hoje` : dias === 1 ? `${tipo} · prazo amanhã` : `${tipo} · prazo em ${dias} dias`;
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
 * Documento para assinatura (tipos_assinatura) primeiro; depois a data mais antiga (preto) ou a mais próxima (demais); depois o nome.
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
      Number(ehTipoAssinatura(b.item.tipo, cfg)) - Number(ehTipoAssinatura(a.item.tipo, cfg)) ||
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
  if (ehTipoAssinatura(item.tipo, cfg)) return { item, nivel, regra: "contrato", motivo: `${item.tipo} com prazo ${quando(dias)}.`, kicker: kickerAssinatura(item.tipo, dias) };
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

  const limiteContrato = somarDias(hoje, cfg.manchete.contrato_antecedencia_dias);
  const contratos = itens
    .filter((i) => ehTipoAssinatura(i.tipo, cfg) && i.categoria === "aberto" && i.data >= hoje && i.data <= limiteContrato) // travados já estão em "travados"
    .sort(porDataENome);

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
    contratos,
    pendencias,
    travados,
    semPrazo,
    avisoNaoUtil,
    semana,
    manchete: escolherManchete(itens, semPrazo, hoje, cfg),
    gestores: resumirGestores(itens, semPrazo, hoje, cfg),
  };
}

/**
 * Seções da tela Hoje sem repetir itens: o da manchete sai de todas as seções; um contrato em
 * "Contratos para análise" não aparece também em "Hoje". `hojeSoManchete`: tudo o que vence hoje já está
 * em outra parte (a seção Hoje some em vez de dizer "Nada vence hoje").
 */
export function secoesDeHoje(e: Pick<Edicao, "manchete" | "pendencias" | "contratos" | "hoje" | "travados" | "semPrazo">) {
  const idManchete = e.manchete?.item.id;
  const fora = <T extends { id: string }>(i: T) => i.id !== idManchete;
  const idsContratos = new Set(e.contratos.map((c) => c.id));
  const hoje = e.hoje.filter((i) => fora(i) && !idsContratos.has(i.id));
  return {
    atrasados: e.pendencias.filter((p) => fora(p.item)),
    contratos: e.contratos.filter(fora),
    hoje,
    travados: e.travados.filter((t) => fora(t.item)),
    semPrazo: e.semPrazo.filter(fora),
    hojeSoManchete: e.hoje.length > 0 && hoje.length === 0,
  };
}
