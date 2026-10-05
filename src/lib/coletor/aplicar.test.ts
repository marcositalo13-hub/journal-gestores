import { describe, expect, it } from "vitest";
import { parseGrupoMes } from "../calendario";
import { montarOcorrencia } from "../recorrencia";
import { grupoAnteriorPara, montarColumnValues, ordenarGruposMes } from "./aplicar";
import { detectarChavesDuplicadas, ordenarPorPosicao, type ColunaMapeada, type Valor } from "./ler";

const val = (p: Partial<Valor>): Valor => ({ text: "", label: null, date: null, number: null, labels: null, ...p });

describe("montarColumnValues — pagamentos", () => {
  const colunas: Record<string, ColunaMapeada> = {
    Favorecido: { id: "fav", type: "text" },
    "Valor (R$)": { id: "val", type: "numbers" },
    Vencimento: { id: "venc", type: "date" },
    Recorrência: { id: "rec", type: "dropdown" },
    Status: { id: "st", type: "status" },
    Coordenação: { id: "coord", type: "dropdown" },
    Observação: { id: "obs", type: "long_text" },
    Chave: { id: "ch", type: "text" },
  };
  const regra = {
    valores: {
      Favorecido: val({ text: "Imobiliária X" }),
      "Valor (R$)": val({ text: "12500.5", number: 12500.5 }),
      Vencimento: val({ text: "2026-10-10", date: "2026-10-10" }),
      Recorrência: val({ text: "Mensal", labels: ["Mensal"] }),
      Status: val({ text: "Pago", label: "Pago" }),
      Coordenação: val({ text: "", labels: [] }),
      Observação: val({ text: "nota da regra" }),
      Chave: val({ text: "lixo" }),
    },
  };

  it("com ajuste de data: efetiva + observação; não copia Status/Chave/data/Observação da regra", () => {
    const oc = montarOcorrencia("13210563084", "2026-10-10", "dia_util_mais_proximo");
    expect(montarColumnValues(regra, oc, "pagamentos", colunas)).toEqual({
      fav: "Imobiliária X",
      val: "12500.5",
      rec: { labels: ["Mensal"] },
      venc: { date: "2026-10-09" },
      st: { label: "Previsto" },
      ch: "13210563084:2026-10-10",
      obs: { text: "Data original 10/10 (sábado), ajustada para dia útil" },
    });
  });

  it("sem ajuste: Observação fica vazia (não enviada)", () => {
    const oc = montarOcorrencia("13210563084", "2026-11-10", "dia_util_mais_proximo");
    const cv = montarColumnValues(regra, oc, "pagamentos", colunas);
    expect(cv.obs).toBeUndefined();
    expect(cv.venc).toEqual({ date: "2026-11-10" });
  });

  it("coluna ausente no quadro é ignorada", () => {
    const oc = montarOcorrencia("1", "2026-11-10", "dia_util_mais_proximo");
    const cv = montarColumnValues(regra, oc, "pagamentos", { ...colunas, Favorecido: null } as Record<string, ColunaMapeada | null>);
    expect(cv.fav).toBeUndefined();
  });
});

describe("montarColumnValues — atividades", () => {
  const colunas: Record<string, ColunaMapeada> = {
    Tipo: { id: "tipo", type: "status" },
    Prazo: { id: "prazo", type: "date" },
    Status: { id: "st", type: "status" },
    Recorrência: { id: "rec", type: "dropdown" },
    Responsável: { id: "resp", type: "text" },
    "Observação / Bloqueio": { id: "obs", type: "text" },
    Chave: { id: "ch", type: "text" },
  };
  const regra = {
    valores: {
      Tipo: val({ text: "Reunião", label: "Reunião" }),
      Prazo: val({ date: "2026-10-07", text: "2026-10-07" }),
      Status: val({ label: "Travado", text: "Travado" }),
      Recorrência: val({ text: "Semanal", labels: ["Semanal"] }),
      Responsável: val({ text: "Ana" }),
      "Observação / Bloqueio": val({ text: "motivo antigo" }),
      Chave: val({}),
    },
  };

  it("sem ajuste (dia útil): status inicial, chave, sem observação", () => {
    const oc = montarOcorrencia("99", "2026-10-14", "manter_e_avisar");
    expect(montarColumnValues(regra, oc, "atividades", colunas)).toEqual({
      tipo: { label: "Reunião" },
      rec: { labels: ["Semanal"] },
      resp: "Ana",
      prazo: { date: "2026-10-14" },
      st: { label: "Não iniciado" },
      ch: "99:2026-10-14",
    });
  });

  it("manter_e_avisar em sábado: data mantida, logo sem texto de ajuste", () => {
    const oc = montarOcorrencia("99", "2026-10-17", "manter_e_avisar");
    const cv = montarColumnValues(regra, oc, "atividades", colunas);
    expect(cv.prazo).toEqual({ date: "2026-10-17" });
    expect(cv.obs).toBeUndefined();
  });

  it("se a data efetiva diferir, preenche Observação / Bloqueio", () => {
    const oc = { chave: "99:2026-10-11", dataOriginal: "2026-10-11", dataEfetiva: "2026-10-09", grupoMes: "Outubro 2026" };
    expect(montarColumnValues(regra, oc, "atividades", colunas).obs).toBe("Data original 11/10 (domingo), ajustada para dia útil");
  });
});

describe("detectarChavesDuplicadas", () => {
  const it_ = (id: string, chave: string | null, grupo: string) => ({ id, chave, grupo: { id: grupo, titulo: grupo } });
  it("reporta ambos os ids; ignora Cadastro e grupos que não são mês", () => {
    const d = detectarChavesDuplicadas([
      it_("1", "r:2026-10-10", "Outubro 2026"),
      it_("2", "r:2026-10-10", "Novembro 2026"),
      it_("3", "r:2026-11-10", "Novembro 2026"),
      it_("4", "r:2026-11-10", "Cadastro"),
      it_("5", "r:2026-11-10", "Novo grupo"),
      it_("6", null, "Outubro 2026"),
      it_("7", null, "Outubro 2026"),
    ]);
    expect(d).toEqual([{ chave: "r:2026-10-10", itens: [{ id: "1", grupo: "Outubro 2026" }, { id: "2", grupo: "Novembro 2026" }] }]);
  });
});

describe("grupos de mês", () => {
  const g = (id: string, titulo = id) => ({ id, titulo });

  it("parseGrupoMes", () => {
    expect(parseGrupoMes("Outubro 2026")).toEqual({ ano: 2026, mes: 10 });
    expect(parseGrupoMes("Março 2027")).toEqual({ ano: 2027, mes: 3 });
    expect(parseGrupoMes("Novo grupo")).toBeNull();
    expect(parseGrupoMes("outubro 2026")).toBeNull();
  });

  it("ordem já correta → nenhum movimento", () => {
    expect(ordenarGruposMes([g("Cadastro"), g("Outubro 2026"), g("Novembro 2026"), g("Novo grupo")])).toEqual([]);
  });

  it("meses fora de ordem / antes do Cadastro → movimentos mínimos", () => {
    const movs = ordenarGruposMes([g("Novembro 2026"), g("Cadastro"), g("Novo grupo"), g("Outubro 2026"), g("Janeiro 2027")]);
    expect(movs).toEqual([
      { grupoId: "Outubro 2026", titulo: "Outubro 2026", depoisDe: "Cadastro" },
      { grupoId: "Novembro 2026", titulo: "Novembro 2026", depoisDe: "Outubro 2026" },
      { grupoId: "Janeiro 2027", titulo: "Janeiro 2027", depoisDe: "Novembro 2026" },
    ]);
  });

  it("sem Cadastro → não reordena", () => expect(ordenarGruposMes([g("Novembro 2026"), g("Outubro 2026")])).toEqual([]));

  it("posição de criação: último mês anterior, senão Cadastro", () => {
    const gs = [g("cad", "Cadastro"), g("out", "Outubro 2026"), g("dez", "Dezembro 2026")];
    expect(grupoAnteriorPara("Novembro 2026", gs)).toBe("out");
    expect(grupoAnteriorPara("Setembro 2026", gs)).toBe("cad");
    expect(grupoAnteriorPara("Janeiro 2027", gs)).toBe("dez");
  });

  it("ordenarPorPosicao usa position numérica", () => {
    const r = ordenarPorPosicao([
      { id: "out", position: "17592186077184.0" },
      { id: "cad", position: "65536" },
    ]);
    expect(r.map((x) => x.id)).toEqual(["cad", "out"]);
  });
});
