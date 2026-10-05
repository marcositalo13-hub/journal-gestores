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

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Converte o texto da coluna Recorrência; "nao_recorrente", ou null se desconhecido/vazio. */
export function parseFrequencia(texto: string | null | undefined): Frequencia | "nao_recorrente" | null {
  const t = semAcento(texto ?? "");
  if (!t) return null;
  const mapa: Record<string, Frequencia | "nao_recorrente"> = {
    semanal: "Semanal",
    quinzenal: "Quinzenal",
    mensal: "Mensal",
    anual: "Anual",
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

/** Ocorrências da regra dentro da janela (por data original), nunca antes da data base. */
export function projetarOcorrencias(regra: RegraRecorrencia, janela: Janela, cfg: JornalConfig = getConfig()): Ocorrencia[] {
  const out: Ocorrencia[] = [];
  for (const d of datasOriginais(regra, janela.fim)) {
    if (d < janela.inicio || d < regra.dataBase) continue;
    out.push(montarOcorrencia(regra.id, d, regra.ajuste, cfg));
  }
  return out;
}
