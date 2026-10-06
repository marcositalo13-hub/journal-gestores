import { describe, expect, it } from "vitest";
import { contarEtapas, type ItemNormalizado, type QuadroLido, type Valor } from "../coletor/ler";
import { categoriaDoStatus, montarItensJornal } from "./itens";

const v = (p: Partial<Valor> = {}): Valor => ({ text: "", label: null, date: null, number: null, labels: null, ...p });
let n = 0;
function item(o: Omit<Partial<ItemNormalizado>, "grupo"> & { grupo?: string }): ItemNormalizado {
  n++;
  const { grupo = "Outubro 2026", ...resto } = o;
  return {
    id: `m${n}`,
    nome: `Item ${n}`,
    url: "https://brb.monday.com/boards/1/pulses/1",
    updatedAt: "2026-10-05T10:00:00Z",
    grupo: { id: "g", titulo: grupo },
    noCadastro: grupo === "Cadastro",
    valores: {},
    data: "2026-10-10",
    status: "Previsto",
    recorrencia: null,
    chave: null,
    motivo: null,
    etapas: null,
    datasSubitens: [],
    ...resto,
  };
}
const itensDe = (qs: QuadroLido[]) => montarItensJornal(qs).itens;
const quadro = (tipo: QuadroLido["tipo"], itens: ItemNormalizado[], dono = "Solange Mata"): QuadroLido => ({
  id: tipo === "pagamentos" ? "100" : "200",
  nome: "Q",
  tipo,
  dono,
  hierarchyType: "multi_level",
  grupos: [],
  colunas: {},
  itens,
  avisos: [],
});

describe("montarItensJornal — quais itens entram", () => {
  it("grupos de mês e 'Não recorrente' no Cadastro; fora regras recorrentes, sem data, sem recorrência e grupos desconhecidos", () => {
    const noMes = item({ nome: "no mês" });
    const avulso = item({ nome: "avulso", grupo: "Cadastro", recorrencia: "Não recorrente" });
    const regra = item({ nome: "regra", grupo: "Cadastro", recorrencia: "Mensal" });
    const semRec = item({ nome: "sem recorrência", grupo: "Cadastro", recorrencia: null });
    const semData = item({ nome: "sem data", data: null });
    const desconhecido = item({ nome: "desconhecido", grupo: "Novo grupo" });
    const out = itensDe([quadro("pagamentos", [noMes, avulso, regra, semRec, semData, desconhecido])]);
    expect(out.map((i) => i.nome)).toEqual(["no mês", "avulso"]);
  });

  it("nunca expõe URLs do monday", () => {
    const out = itensDe([quadro("pagamentos", [item({})])]);
    expect(JSON.stringify(out)).not.toMatch(/monday\.com|https?:/);
  });
});

describe("categoria e tipo", () => {
  it("mapeia os rótulos de status por tipo de quadro", () => {
    expect(categoriaDoStatus("Pago", "pagamentos")).toBe("concluido");
    expect(categoriaDoStatus("Concluído", "atividades")).toBe("concluido");
    expect(categoriaDoStatus("Pago", "atividades")).toBe("aberto"); // "Pago" não é o concluído de atividades
    expect(categoriaDoStatus("Travado", "pagamentos")).toBe("travado");
    expect(categoriaDoStatus("Cancelado", "atividades")).toBe("cancelado");
    for (const s of ["Previsto", "Não iniciado", "Em andamento", null]) expect(categoriaDoStatus(s, "atividades")).toBe("aberto");
  });

  it("pagamentos → 'Pagamento'; atividades usa a coluna Tipo (padrão 'Atividade')", () => {
    const [p] = itensDe([quadro("pagamentos", [item({})])]);
    expect(p.tipo).toBe("Pagamento");
    const q = quadro("atividades", [
      item({ nome: "c", valores: { Tipo: v({ label: "Contrato", text: "Contrato" }) } }),
      item({ nome: "e", valores: { Tipo: v({ label: "Entrega", text: "Entrega" }) } }),
      item({ nome: "x", valores: {} }),
    ]);
    expect(itensDe([q]).map((i) => i.tipo)).toEqual(["Contrato", "Entrega", "Atividade"]);
  });
});

describe("campos copiados", () => {
  it("pagamentos: valor, favorecido, coordenação, observação, recorrência, chave, dono", () => {
    const [i] = itensDe([
      quadro("pagamentos", [
        item({
          status: "Pago",
          recorrencia: "Mensal",
          chave: "1:2026-10-10",
          valores: {
            "Valor (R$)": v({ number: 80000, text: "80000" }),
            Favorecido: v({ text: "Imobiliária" }),
            Coordenação: v({ labels: ["Adm. e Financeira"], text: "Adm. e Financeira" }),
            Observação: v({ text: "Data original 10/10 (sábado), ajustada para dia útil" }),
          },
        }),
      ]),
    ]);
    expect(i).toMatchObject({
      quadroId: "100",
      tipoQuadro: "pagamentos",
      dono: "Solange Mata",
      data: "2026-10-10",
      status: "Pago",
      categoria: "concluido",
      valor: 80000,
      favorecido: "Imobiliária",
      coordenacao: "Adm. e Financeira",
      observacao: "Data original 10/10 (sábado), ajustada para dia útil",
      recorrencia: "Mensal",
      chave: "1:2026-10-10",
    });
  });

  it("atividades: responsável e observação / bloqueio; vazios ficam ausentes; etapas só se houver", () => {
    const q = quadro(
      "atividades",
      [
        item({ valores: { Responsável: v({ text: "Ana" }), "Observação / Bloqueio": v({ text: "Aguardando" }) }, etapas: { total: 4, concluidas: 1 } }),
        item({ valores: { Responsável: v({ text: "" }) } }),
      ],
      "TESTE",
    );
    const [a, b] = itensDe([q]);
    expect(a).toMatchObject({ responsavel: "Ana", observacao: "Aguardando", etapas: { total: 4, concluidas: 1 }, dono: "TESTE" });
    expect(b).not.toHaveProperty("responsavel");
    expect(b).not.toHaveProperty("etapas");
    expect(b).not.toHaveProperty("valor");
  });
});

describe("contarEtapas (subitens)", () => {
  const sub = (titulo: string, label: string | null) => ({ id: "s", column_values: [{ id: "x", text: label, label, column: { title: titulo } }] });
  it("conta concluídas; cancelados não entram no total; coluna achada pelo título", () => {
    const r = contarEtapas(
      [sub("Status", "Concluído"), sub("Status", "Cancelado"), sub("Status", "Em andamento"), sub("Status", null), sub("Outra", "Concluído")],
      "Status",
      "Concluído",
      "Cancelado",
    );
    // a de "Outra" não tem coluna Status → status vazio: conta no total, mas não como concluída
    expect(r).toEqual({ total: 4, concluidas: 1 });
  });
  it("sem subitens → null", () => {
    expect(contarEtapas([], "Status", "Concluído", "Cancelado")).toBeNull();
  });
});
