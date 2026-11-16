import {
  diaUtilAnterior,
  diaUtilMaisProximo,
  ehDiaUtil,
  formatar,
  grupoDoMes,
  partes,
  somarDias,
  somarMeses,
  ultimoDiaDoMes,
  type DataISO,
} from "./calendario";
import { normalizarRotulo } from "./rotulos";
import { getConfig, type AjusteDiaNaoUtil, type JornalConfig } from "./config";

export type Frequencia = "Semanal" | "Quinzenal" | "Mensal" | "Anual";
export const NAO_RECORRENTE = "Não recorrente";

export interface RegraRecorrencia {
  /** id do item de Cadastro no monday */
  id: string;
  frequencia: Frequencia;
  /** data base da regra (primeira ocorrência) */
  dataBase: DataISO;
  ajuste: AjusteDiaNaoUtil;
}

export interface Janela {
  inicio: DataISO;
  fim: DataISO;
}

export interface Ocorrencia {
  chave: string;
  dataOriginal: DataISO;
  dataEfetiva: DataISO;
  grupoMes: string;
  /** só para "manter_e_avisar" quando dataOriginal não é dia útil */
  avisarEm?: DataISO;
}


/**
 * Converte o rótulo da coluna Recorrência. Tolera renomeações: espaços, prefixo numérico ("4. ", "4 - ", "4)"),
 * maiúsculas e acentos são ignorados. "diaria" é reconhecida mas não suportada; null = desconhecido ou vazio.
 */
export function parseFrequencia(texto: string | null | undefined): Frequencia | "nao_recorrente" | "diaria" | null {
  const t = normalizarRotulo(texto);
  if (!t) return null;
  const mapa: Record<string, Frequencia | "nao_recorrente" | "diaria"> = {
    semanal: "Semanal",
    quinzenal: "Quinzenal",
    mensal: "Mensal",
    anual: "Anual",
    diaria: "diaria",
    "nao recorrente": "nao_recorrente",
  };
  return mapa[t] ?? null;
}

/** Janela padrão: 1º dia do mês corrente até o último dia do mês seguinte. */
export function janelaPadrao(ref: DataISO): Janela {
  const [y, m] = partes(ref);
  const [y2, m2] = somarMeses(y, m, 1);
  return { inicio: formatar(y, m, 1), fim: formatar(y2, m2, ultimoDiaDoMes(y2, m2)) };
}

/** Monta a ocorrência de uma data original aplicando o ajuste de dia não útil. */
export function montarOcorrencia(regraId: string, dataOriginal: DataISO, ajuste: AjusteDiaNaoUtil, cfg: JornalConfig = getConfig()): Ocorrencia {
  const oc: Ocorrencia = { chave: `${regraId}:${dataOriginal}`, dataOriginal, dataEfetiva: dataOriginal, grupoMes: "" };
  if (ajuste === "dia_util_mais_proximo") {
    oc.dataEfetiva = diaUtilMaisProximo(dataOriginal, cfg);
  } else if (!ehDiaUtil(dataOriginal, cfg)) {
    oc.avisarEm = diaUtilAnterior(dataOriginal, cfg);
  }
  oc.grupoMes = grupoDoMes(oc.dataEfetiva, cfg);
  return oc;
}

/** Datas originais da regra a partir da base (inclusive), até `fim`. */
function* datasOriginais(regra: RegraRecorrencia, fim: DataISO): Generator<DataISO> {
  const [by, bm, bd] = partes(regra.dataBase);
  switch (regra.frequencia) {
    case "Semanal":
    case "Quinzenal": {
      const passo = regra.frequencia === "Semanal" ? 7 : 14;
      for (let d = regra.dataBase; d <= fim; d = somarDias(d, passo)) yield d;
      return;
    }
    case "Mensal": {
      // Sempre parte do dia base (31 continua 31 nos meses seguintes; não acumula o clamp).
      for (let n = 0; ; n++) {
        const [y, m] = somarMeses(by, bm, n);
        const d = formatar(y, m, Math.min(bd, ultimoDiaDoMes(y, m)));
        if (d > fim) return;
        yield d;
      }
    }
    case "Anual": {
      for (let y = by; ; y++) {
        const d = formatar(y, bm, Math.min(bd, ultimoDiaDoMes(y, bm)));
        if (d > fim) return;
        yield d;
      }
    }
  }
}

// ---------- modelo de item único (estilo ClickUp): um item vivo que avança de período em período ----------

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Dia esperado para a âncora num mês (ex.: âncora 31 em fevereiro → 28/29). */
function diaAncorado(ancora: DataISO, ano: number, mes: number): number {
  return Math.min(partes(ancora)[2], ultimoDiaDoMes(ano, mes));
}

/**
 * Âncora válida para o Prazo atual. Vazia (ou ilegível) → o próprio Prazo. Se o Prazo não cai onde a âncora mandaria
 * (Mensal: o dia ancorado no mês do Prazo; Anual: mês e dia ancorados; Semanal/Quinzenal: o próprio Prazo), alguém
 * mudou a data à mão e a âncora passa a ser o novo Prazo. `mudou` = é preciso gravar.
 */
export function ancoraEfetiva(freq: Frequencia, prazo: DataISO, ancoraAtual: string | null | undefined): { ancora: DataISO; mudou: boolean } {
  const a = (ancoraAtual ?? "").trim();
  if (!DATA_ISO.test(a)) return { ancora: prazo, mudou: true };
  const [py, pm, pd] = partes(prazo);
  let confere: boolean;
  if (freq === "Mensal") confere = pd === diaAncorado(a, py, pm);
  else if (freq === "Anual") confere = pm === partes(a)[1] && pd === diaAncorado(a, py, pm);
  else confere = a === prazo;
  return confere ? { ancora: a, mudou: false } : { ancora: prazo, mudou: true };
}

/**
 * Próximo Prazo: um período depois do Prazo atual (nunca da data de conclusão). Semanal +7; Quinzenal +14;
 * Mensal: mês seguinte no dia da âncora, limitado ao fim do mês (31 → 28/02 → 31/03); Anual: ano seguinte, mesmo
 * dia/mês da âncora (29/02 → 28/02 nos anos comuns, volta a 29 no bissexto).
 */
export function proximaData(freq: Frequencia, prazo: DataISO, ancora: DataISO): DataISO {
  if (freq === "Semanal") return somarDias(prazo, 7);
  if (freq === "Quinzenal") return somarDias(prazo, 14);
  const [py, pm] = partes(prazo);
  if (freq === "Mensal") {
    const [y, m] = somarMeses(py, pm, 1);
    return formatar(y, m, diaAncorado(ancora, y, m));
  }
  const [, am] = partes(ancora);
  return formatar(py + 1, am, diaAncorado(ancora, py + 1, am));
}

/** Ocorrências da regra dentro da janela (por data original), nunca antes da data base. */
export function projetarOcorrencias(regra: RegraRecorrencia, janela: Janela, cfg: JornalConfig = getConfig()): Ocorrencia[] {
  const out: Ocorrencia[] = [];
  for (const d of datasOriginais(regra, janela.fim)) {
    if (d < janela.inicio || d < regra.dataBase) continue;
    out.push(montarOcorrencia(regra.id, d, regra.ajuste, cfg));
  }
  return out;
}
