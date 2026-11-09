// Dados de exemplo da aba Pagamentos (só em desenvolvimento: ?fixture=pagamentos). Nunca vai para produção.
import { formatar, partes, somarDias, somarMeses, type DataISO } from "../calendario";
import type { Categoria, ItemJornal } from "./itens";

let n = 0;
function pag(o: { nome: string; valor: number; data: DataISO; dono: string; coordenacao: string; categoria?: Categoria; status?: string; observacao?: string; favorecido?: string }): ItemJornal {
  n++;
  const categoria = o.categoria ?? "aberto";
  return {
    id: `fx-pag-${n}`,
    nome: `[EXEMPLO] ${o.nome}`,
    quadroId: "fixture",
    tipoQuadro: "pagamentos",
    dono: o.dono,
    tipo: "Pagamento",
    data: o.data,
    status: o.status ?? (categoria === "concluido" ? "Pago" : categoria === "travado" ? "Travado" : categoria === "cancelado" ? "Cancelado" : "Previsto"),
    categoria,
    valor: o.valor,
    favorecido: o.favorecido ?? "Fornecedor Exemplo",
    coordenacao: o.coordenacao,
    ...(o.observacao ? { observacao: o.observacao } : {}),
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const KEITE = { dono: "Keite Martins", coordenacao: "Adm. e Financeira" };
const JOAO = { dono: "João Silva", coordenacao: "Controladoria" };
const GRAZI = { dono: "Graziely Palma", coordenacao: "Contábil e Fiscal" };
const SOLANGE = { dono: "Solange Mata", coordenacao: "Superintendência" };

/** Cenário relativo a `hoje`: atrasados, pago, travado, cancelado, vários dias de saída e o mês seguinte. */
export function fixturePagamentos(hoje: DataISO): ItemJornal[] {
  n = 0;
  const [ano, mes] = partes(hoje);
  const [anoProx, mesProx] = somarMeses(ano, mes, 1);
  const noMes = (dia: number) => formatar(ano, mes, dia);
  const noProx = (dia: number) => formatar(anoProx, mesProx, dia);
  const d = (k: number) => somarDias(hoje, k);
  return [
    pag({ nome: "Aluguel da sede (atrasado)", valor: 80000, data: d(-9), ...KEITE }),
    pag({ nome: "Multa contratual (atrasada)", valor: 15000, data: d(-3), ...JOAO }),
    pag({ nome: "Energia elétrica (paga)", valor: 18400.5, data: noMes(2), ...KEITE, categoria: "concluido" }),
    pag({ nome: "Honorários contábeis (pago)", valor: 32000, data: noMes(3), ...GRAZI, categoria: "concluido" }),
    pag({ nome: "Licenças de software", valor: 120000, data: d(2), ...SOLANGE }),
    pag({ nome: "Seguro predial", valor: 12500, data: d(5), ...KEITE }),
    pag({ nome: "Auditoria externa", valor: 22000, data: d(5), ...JOAO }),
    pag({ nome: "Manutenção do elevador", valor: 6800, data: d(12), ...KEITE }),
    pag({ nome: "Parcela do convênio", valor: 45000, data: d(20), ...GRAZI }),
    pag({ nome: "Reforma do 3º andar", valor: 300000, data: d(33), ...SOLANGE }),
    pag({ nome: "Consultoria tributária", valor: 9500, data: d(44), ...GRAZI }),
    pag({ nome: "Fornecedor de limpeza", valor: 14200, data: d(7), ...KEITE, categoria: "travado", observacao: "Aguardando nota fiscal do fornecedor" }),
    pag({ nome: "Pagamento duplicado (cancelado)", valor: 999999, data: d(3), ...KEITE, categoria: "cancelado" }),
    pag({ nome: "Fora da janela de 45 dias", valor: 50000, data: d(60), ...JOAO }),
    pag({ nome: "Aluguel da sede (próximo mês)", valor: 80000, data: noProx(10), ...KEITE }),
    pag({ nome: "Honorários (próximo mês)", valor: 32000, data: noProx(5), ...GRAZI, categoria: "concluido" }),
  ];
}
