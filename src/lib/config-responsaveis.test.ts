import { describe, expect, it } from "vitest";
import raw from "../../config/jornal.config.json";
import { getConfig, validarConfig } from "./config";

const comGestor = (extra: Record<string, unknown>) => ({ ...raw, gestores: [{ ...raw.gestores[0], ...extra }, ...raw.gestores.slice(1)] });

describe("config: sem coordenacoes nem multiseguros", () => {
  it("as chaves antigas não existem mais", () => {
    const c = getConfig() as unknown as Record<string, unknown>;
    expect("coordenacoes" in c).toBe(false);
    expect("multiseguros" in c).toBe(false);
  });
  it("o quadro de pagamentos é uma lista com grupo de finalizados próprio", () => {
    const q = getConfig().quadros.find((x) => x.tipo === "pagamentos")!;
    expect(q).toMatchObject({ layout: "lista", dono: "Egídio", grupo_finalizadas: "Visualizados", grupo_abertos: "Pagamentos", finalizar_apos_dias: 0 });
  });
  it("layout lista exige grupo_finalizadas; layouts por_mes/por_area exigem Recorrência e Chave; status_travado só é obrigatório em atividades", () => {
    const quadros = (f: (q: Record<string, unknown>) => Record<string, unknown>) => raw.quadros.map((q) => (q.tipo === "pagamentos" ? f(q) : q));
    expect(() => validarConfig({ ...raw, quadros: quadros((q) => ({ ...q, grupo_finalizadas: undefined })) })).toThrow(/lista exige grupo_finalizadas/);
    expect(() => validarConfig({ ...raw, quadros: quadros((q) => ({ ...q, layout: "por_mes" })) })).toThrow(/exige a coluna "Chave"/);
    const semTravado = { ...raw.tipos_de_quadro, atividades: { ...raw.tipos_de_quadro.atividades, status_travado: undefined } };
    expect(() => validarConfig({ ...raw, tipos_de_quadro: semTravado })).toThrow(/atividades\.status_travado/);
  });
  it("configs com pagamentos em layout inválido são recusadas", () => {
    expect(() => validarConfig({ ...raw, quadros: raw.quadros.map((q) => ({ ...q, layout: "tabela" })) })).toThrow(/layout/);
  });
});

describe("config: whatsapp (opcional)", () => {
  it("ausente para todos hoje", () => expect(getConfig().gestores.every((g) => g.whatsapp === undefined)).toBe(true));
  it("aceita dígitos com código do país (10 a 15)", () => {
    expect(validarConfig(comGestor({ whatsapp: "5561999999999" })).gestores[0].whatsapp).toBe("5561999999999");
    expect(() => validarConfig(comGestor({ whatsapp: "1234567890" }))).not.toThrow();
  });
  it("rejeita formatação, sinal de mais, letras, curto ou longo demais, e não-string", () => {
    for (const ruim of ["+55 61 99999-9999", "(61) 99999-9999", "55619999a9999", "123456789", "1234567890123456", "", 5561999999999]) {
      expect(() => validarConfig(comGestor({ whatsapp: ruim })), String(ruim)).toThrow(/whatsapp/);
    }
  });
});

describe("fotos_recorte", () => {
  it("aceita north/center/attention, rejeita o resto, é opcional", async () => {
    const { validarConfig } = await import("./config");
    const raw = (await import("../../config/jornal.config.json")).default;
    expect(() => validarConfig({ ...raw, fotos_recorte: { "joao-silva": "center" } })).not.toThrow();
    expect(() => validarConfig({ ...raw, fotos_recorte: { "joao-silva": "south" } })).toThrow(/fotos_recorte/);
    expect(() => validarConfig({ ...raw, fotos_recorte: [] })).toThrow(/fotos_recorte/);
  });
});
