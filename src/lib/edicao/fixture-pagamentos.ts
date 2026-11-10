// Dados de exemplo da aba Pagamentos (só em desenvolvimento: ?fixture=pagamentos). Nunca vai para produção.
import { somarDias, type DataISO } from "../calendario";
import { getConfig } from "../config";
import type { Categoria, ItemEdicao, ItemJornal } from "./itens";
import { motivoAprovacao } from "./pagamentos";

let n = 0;
function pag(
  o: { nome: string; valor: number; data: DataISO | null; categoria?: Categoria; autorizadoHaDias?: number; autorizadoPor?: string; observacao?: string },
  hoje: DataISO,
): ItemEdicao {
  n++;
  const categoria = o.categoria ?? "aberto";
  const status = categoria === "concluido" ? "Autorizado" : categoria === "cancelado" ? "Cancelado" : "Aguardando autorização";
  const base = {
    id: `fx-pag-${n}`,
    nome: `[EXEMPLO] ${o.nome}`,
    quadroId: "fixture",
    tipoQuadro: "pagamentos" as const,
    dono: getConfig().diretor,
    tipo: "Pagamento" as const,
    status,
    categoria,
    valor: o.valor,
    motivoAprovacao: motivoAprovacao(o.valor, getConfig()),
    ...(o.observacao ? { observacao: o.observacao } : {}),
    ...(categoria === "concluido" && o.autorizadoPor !== "" ? { autorizadoPor: o.autorizadoPor ?? "Egídio" } : {}),
    ...(categoria === "concluido" && o.autorizadoHaDias !== undefined ? { autorizadoEm: somarDias(hoje, -o.autorizadoHaDias) } : {}),
    updatedAt: `${somarDias(hoje, -(o.autorizadoHaDias ?? 30))}T15:00:00Z`,
  };
  return o.data ? ({ ...base, data: o.data } satisfies ItemJornal) : { ...base, data: null, motivo: "sem_prazo" };
}

/** Cenário relativo a `hoje`: vencidos, vencendo hoje/amanhã, mais adiante, sem vencimento, autorizados (vários meses) e cancelado. */
export function fixturePagamentos(hoje: DataISO): ItemEdicao[] {
  n = 0;
  const d = (k: number) => somarDias(hoje, k);
  return [
    pag({ nome: "Aluguel da sede (vencido)", valor: 80000, data: d(-9) }, hoje),
    pag({ nome: "Multa contratual (vencida)", valor: 15000, data: d(-1) }, hoje),
    pag({ nome: "Licenças de software", valor: 120000, data: d(0) }, hoje),
    pag({ nome: "Seguro predial", valor: 12500, data: d(1) }, hoje),
    pag({ nome: "Auditoria externa", valor: 99999.99, data: d(5) }, hoje),
    pag({ nome: "Reforma do 3º andar", valor: 300000, data: d(33) }, hoje),
    pag({ nome: "Fornecedor sem vencimento", valor: 9500, data: null }, hoje),
    pag({ nome: "Energia elétrica", valor: 18400.5, data: d(2), categoria: "concluido", autorizadoHaDias: 1, observacao: "Conta de outubro" }, hoje),
    pag({ nome: "Honorários contábeis", valor: 132000, data: d(-3), categoria: "concluido", autorizadoHaDias: 6, autorizadoPor: "Marcos" }, hoje),
    pag({ nome: "Licença anual do ERP", valor: 120000, data: d(-40), categoria: "concluido", autorizadoHaDias: 45 }, hoje),
    pag({ nome: "Autorizado direto no monday", valor: 4000, data: d(-50), categoria: "concluido", autorizadoPor: "" }, hoje),
    pag({ nome: "Pagamento duplicado (cancelado)", valor: 999999, data: d(3), categoria: "cancelado" }, hoje),
  ];
}
