// Config SÓ PARA TESTES do layout genérico "por_mes" (Cadastro + grupos de mês + recorrência), que nenhum quadro
// real usa mais: o quadro de Pagamentos agora é "lista". Mantém o caminho por_mes coberto sem depender do config real.
import raw from "../../../config/jornal.config.json";
import { validarConfig, type JornalConfig } from "../config";

const PAGAMENTOS_POR_MES = {
  data: "Vencimento",
  status: "Status",
  colunas: {
    Favorecido: "text",
    "Valor (R$)": "numbers",
    Vencimento: "date",
    Recorrência: "dropdown",
    Status: "status",
    Coordenação: "dropdown",
    Observação: "text",
    Chave: "text",
  },
  obrigatorias: ["Vencimento", "Valor (R$)"],
  status_concluido: "Pago",
  status_travado: "Travado",
  status_cancelado: "Cancelado",
  status_inicial: "Previsto",
  campo_motivo: "Observação",
  ajuste_dia_nao_util: "dia_util_mais_proximo",
};

export const cfgPorMes: JornalConfig = validarConfig({
  ...raw,
  quadros: [{ id: "18434047675", tipo: "pagamentos", layout: "por_mes", dono: "Solange Mata" }, raw.quadros.find((q) => q.tipo === "atividades")],
  tipos_de_quadro: { ...raw.tipos_de_quadro, pagamentos: PAGAMENTOS_POR_MES },
});
