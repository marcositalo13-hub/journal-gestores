import { describe, expect, it } from "vitest";
import { janelaPadrao, parseFrequencia, projetarOcorrencias, type Frequencia, type RegraRecorrencia } from "./recorrencia";

const regra = (frequencia: Frequencia, dataBase: string, ajuste: RegraRecorrencia["ajuste"] = "dia_util_mais_proximo"): RegraRecorrencia => ({
  id: "1",
  frequencia,
  dataBase,
  ajuste,
});
const originais = (r: RegraRecorrencia, inicio: string, fim: string) => projetarOcorrencias(r, { inicio, fim }).map((o) => o.dataOriginal);

describe("janelaPadrao", () => {
  it("1º do mês corrente até o fim do próximo", () => expect(janelaPadrao("2026-10-05")).toEqual({ inicio: "2026-10-01", fim: "2026-11-30" }));
  it("vira o ano", () => expect(janelaPadrao("2026-12-20")).toEqual({ inicio: "2026-12-01", fim: "2027-01-31" }));
});

describe("projetarOcorrencias", () => {
  it("Mensal base 2027-01-30 → fevereiro 2027-02-28", () => {
    expect(originais(regra("Mensal", "2027-01-30"), "2027-02-01", "2027-02-28")).toEqual(["2027-02-28"]);
  });

  it("Mensal base 2026-01-31 → 02-28 e depois 03-31 (sem deriva)", () => {
    expect(originais(regra("Mensal", "2026-01-31"), "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("Semanal base 2026-10-07, janela out–nov 2026: 8 ocorrências, última 2026-11-25", () => {
    const d = originais(regra("Semanal", "2026-10-07"), "2026-10-01", "2026-11-30");
    expect(d).toHaveLength(8);
    expect(d.at(-1)).toBe("2026-11-25");
  });

  it("Quinzenal +14 e nunca antes da base", () => {
    expect(originais(regra("Quinzenal", "2026-10-20"), "2026-10-01", "2026-11-30")).toEqual(["2026-10-20", "2026-11-03", "2026-11-17"]);
  });

  it("Anual 29/02 vira 28/02 em ano não bissexto", () => {
    expect(originais(regra("Anual", "2024-02-29"), "2026-01-01", "2028-12-31")).toEqual(["2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("pagamentos: dataEfetiva = dia útil mais próximo; chave e grupo pela efetiva", () => {
    const [out, nov] = projetarOcorrencias(regra("Mensal", "2026-10-10"), { inicio: "2026-10-01", fim: "2026-11-30" });
    expect(out).toEqual({ chave: "1:2026-10-10", dataOriginal: "2026-10-10", dataEfetiva: "2026-10-09", grupoMes: "Outubro 2026" });
    expect(nov.dataEfetiva).toBe("2026-11-10");
    // 01/11/2026 é domingo → efetiva sex 30/10 → grupo Outubro
    const [x] = projetarOcorrencias(regra("Mensal", "2026-11-01"), { inicio: "2026-11-01", fim: "2026-11-01" });
    expect(x).toMatchObject({ dataEfetiva: "2026-10-30", grupoMes: "Outubro 2026" });
  });

  it("atividades: mantém data e avisa no dia útil anterior", () => {
    const [o] = projetarOcorrencias(regra("Mensal", "2026-10-17", "manter_e_avisar"), { inicio: "2026-10-01", fim: "2026-10-31" });
    expect(o).toEqual({ chave: "1:2026-10-17", dataOriginal: "2026-10-17", dataEfetiva: "2026-10-17", grupoMes: "Outubro 2026", avisarEm: "2026-10-16" });
  });
});

describe("parseFrequencia", () => {
  it("aceita variações de caixa/acento", () => {
    expect(parseFrequencia("Mensal")).toBe("Mensal");
    expect(parseFrequencia("não recorrente")).toBe("nao_recorrente");
    expect(parseFrequencia("Nao Recorrente")).toBe("nao_recorrente");
    expect(parseFrequencia("")).toBeNull();
    expect(parseFrequencia("Bimestral")).toBeNull();
  });
});
