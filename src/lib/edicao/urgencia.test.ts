import { describe, expect, it } from "vitest";
import raw from "../../../config/jornal.config.json";
import { getConfig, validarConfig } from "../config";
import { piorNivel } from "../niveis";
import type { Categoria } from "./itens";
import { limiteDeAtencao, nivelUrgencia, piorNivelAberto, rotuloUrgencia, textosLegenda } from "./urgencia";

const cfg = getConfig();
const mk = (data: string | null, categoria: Categoria = "aberto", tipoQuadro?: string) => ({ data, categoria, tipoQuadro });

// 2026-11-20 (sexta) é feriado; 21 e 22 são fim de semana.
// Quarta 18/11: +1 útil = qui 19; +2 = seg 23; +3 = ter 24; +4 = qua 25.
const HOJE = "2026-11-18";

describe("nivelUrgencia: limites", () => {
  it("a janela de atenção são 3 dias úteis (config) e pula fim de semana e feriado", () => {
    expect(cfg.urgencia.atencao_dias_uteis).toBe(3);
    expect(limiteDeAtencao(HOJE, cfg)).toBe("2026-11-24");
  });

  it("ontem → preto; hoje → vermelho", () => {
    expect(nivelUrgencia(mk("2026-11-17"), HOJE, cfg)).toBe("preto");
    expect(nivelUrgencia(mk("2026-11-18"), HOJE, cfg)).toBe("vermelho");
  });

  it("+1 dia útil → amarelo; +3 dias úteis (atravessando fim de semana e o feriado de 20/11) → amarelo; +4 → verde", () => {
    expect(nivelUrgencia(mk("2026-11-19"), HOJE, cfg)).toBe("amarelo"); // +1
    expect(nivelUrgencia(mk("2026-11-23"), HOJE, cfg)).toBe("amarelo"); // +2 (seg)
    expect(nivelUrgencia(mk("2026-11-24"), HOJE, cfg)).toBe("amarelo"); // +3 (ter)
    expect(nivelUrgencia(mk("2026-11-25"), HOJE, cfg)).toBe("verde"); // +4 (qua)
  });

  it("dias não úteis no meio da janela (feriado, sábado, domingo) também são amarelo", () => {
    expect(nivelUrgencia(mk("2026-11-20"), HOJE, cfg)).toBe("amarelo"); // feriado
    expect(nivelUrgencia(mk("2026-11-21"), HOJE, cfg)).toBe("amarelo"); // sábado
    expect(nivelUrgencia(mk("2026-11-22"), HOJE, cfg)).toBe("amarelo"); // domingo
  });

  it("de sexta: +1 é segunda; +3 é quarta; quinta já é verde", () => {
    const sexta = "2026-11-13";
    expect(nivelUrgencia(mk("2026-11-16"), sexta, cfg)).toBe("amarelo"); // seg (+1 útil)
    expect(nivelUrgencia(mk("2026-11-18"), sexta, cfg)).toBe("amarelo"); // qua (+3 úteis)
    expect(nivelUrgencia(mk("2026-11-19"), sexta, cfg)).toBe("verde"); // qui (+4 úteis)
  });

  it("travado → vermelho, mesmo longe; atrasado e travado → preto", () => {
    expect(nivelUrgencia(mk("2026-12-30", "travado"), HOJE, cfg)).toBe("vermelho");
    expect(nivelUrgencia(mk("2026-11-10", "travado"), HOJE, cfg)).toBe("preto");
    expect(nivelUrgencia(mk(null, "travado"), HOJE, cfg)).toBe("vermelho");
  });

  it("sem prazo → amarelo", () => {
    expect(nivelUrgencia(mk(null), HOJE, cfg)).toBe("amarelo");
  });

  it("concluído → verde (mesmo atrasado); cancelado → nenhum", () => {
    expect(nivelUrgencia(mk("2026-11-01", "concluido"), HOJE, cfg)).toBe("verde");
    expect(nivelUrgencia(mk(null, "concluido"), HOJE, cfg)).toBe("verde");
    expect(nivelUrgencia(mk("2026-11-01", "cancelado"), HOJE, cfg)).toBeNull();
    expect(nivelUrgencia(mk(null, "cancelado"), HOJE, cfg)).toBeNull();
  });

  it("a janela segue a config (1 dia útil)", () => {
    const c1 = validarConfig({ ...raw, urgencia: { atencao_dias_uteis: 1 } });
    expect(nivelUrgencia(mk("2026-11-19"), HOJE, c1)).toBe("amarelo");
    expect(nivelUrgencia(mk("2026-11-23"), HOJE, c1)).toBe("verde");
  });
});

describe("rotuloUrgencia: o texto que acompanha a cor", () => {
  it("atrasado, hoje, travado, amanhã, em N dias úteis, sem prazo, em dia, concluído", () => {
    expect(rotuloUrgencia(mk("2026-11-17"), HOJE, cfg)).toBe("Atrasado há 1 dia");
    expect(rotuloUrgencia(mk("2026-11-08"), HOJE, cfg)).toBe("Atrasado há 10 dias");
    expect(rotuloUrgencia(mk("2026-11-18"), HOJE, cfg)).toBe("Vence hoje");
    expect(rotuloUrgencia(mk("2026-12-30", "travado"), HOJE, cfg)).toBe("Travado");
    expect(rotuloUrgencia(mk("2026-11-10", "travado"), HOJE, cfg)).toBe("Atrasado há 8 dias");
    expect(rotuloUrgencia(mk("2026-11-19"), HOJE, cfg)).toBe("Amanhã");
    expect(rotuloUrgencia(mk("2026-11-23"), HOJE, cfg)).toBe("Em 2 dias úteis");
    expect(rotuloUrgencia(mk("2026-11-24"), HOJE, cfg)).toBe("Em 3 dias úteis");
    expect(rotuloUrgencia(mk(null), HOJE, cfg)).toBe("Sem prazo");
    expect(rotuloUrgencia(mk("2026-11-25"), HOJE, cfg)).toBe("Em dia");
    expect(rotuloUrgencia(mk("2026-11-01", "concluido"), HOJE, cfg)).toBe("Concluído");
    expect(rotuloUrgencia(mk("2026-11-01", "concluido", "pagamentos"), HOJE, cfg)).toBe("Pago");
    expect(rotuloUrgencia(mk("2026-11-01", "cancelado"), HOJE, cfg)).toBeNull();
  });

  it("singular: 1 dia útil", () => {
    expect(rotuloUrgencia(mk("2026-11-16"), "2026-11-13", cfg)).toBe("Em 1 dia útil"); // sexta → segunda
  });
});

describe("pior nível", () => {
  it("preto > vermelho > amarelo > verde", () => {
    expect(piorNivel(["verde", "amarelo", "preto", "vermelho"])).toBe("preto");
    expect(piorNivel(["verde", "amarelo", "vermelho"])).toBe("vermelho");
    expect(piorNivel([null, "verde"])).toBe("verde");
    expect(piorNivel([])).toBeNull();
  });

  it("piorNivelAberto: ignora concluídos; tudo verde → nenhum", () => {
    expect(piorNivelAberto([mk("2026-11-01", "concluido"), mk("2026-12-30")], HOJE, cfg)).toBeNull();
    expect(piorNivelAberto([mk("2026-11-01", "concluido"), mk("2026-11-19"), mk("2026-12-30")], HOJE, cfg)).toBe("amarelo");
    expect(piorNivelAberto([mk("2026-11-19"), mk("2026-11-18"), mk(null)], HOJE, cfg)).toBe("vermelho");
    expect(piorNivelAberto([mk("2026-11-19"), mk("2026-11-10", "travado")], HOJE, cfg)).toBe("preto");
    expect(piorNivelAberto([], HOJE, cfg)).toBeNull();
  });
});

describe("legenda", () => {
  it("texto gerado da config: os 4 níveis na ordem e o número de dias úteis", () => {
    const l = textosLegenda(cfg);
    expect(l.map((x) => x.nivel)).toEqual(["preto", "vermelho", "amarelo", "verde"]);
    expect(l[2].regra).toContain("3 dias úteis");
    expect(l[3].regra).toContain("3 dias úteis");
    const c1 = validarConfig({ ...raw, urgencia: { atencao_dias_uteis: 1 } });
    expect(textosLegenda(c1)[2].regra).toContain("1 dia útil");
  });
});

describe("config.urgencia é validada", () => {
  it("rejeita ausente, zero, negativo, fracionário e texto", () => {
    const semUrgencia: Record<string, unknown> = { ...raw };
    delete semUrgencia.urgencia;
    expect(() => validarConfig(semUrgencia)).toThrow(/urgencia/);
    for (const v of [0, -1, 1.5, "3"]) expect(() => validarConfig({ ...raw, urgencia: { atencao_dias_uteis: v } })).toThrow(/atencao_dias_uteis/);
  });
});

describe("rótulo de itens sem prazo", () => {
  it("sem prazo comum, recorrência sem data inicial e travado sem prazo; sempre amarelo (travado: vermelho)", () => {
    const sem = (motivo: "sem_prazo" | "regra_sem_data", categoria: Categoria = "aberto") => ({ data: null, categoria, motivo });
    expect(rotuloUrgencia(sem("sem_prazo"), HOJE, cfg)).toBe("Sem prazo");
    expect(rotuloUrgencia(sem("regra_sem_data"), HOJE, cfg)).toBe("Recorrência sem data inicial — não gera as cópias");
    expect(nivelUrgencia(sem("regra_sem_data"), HOJE, cfg)).toBe("amarelo");
    expect(rotuloUrgencia(sem("sem_prazo", "travado"), HOJE, cfg)).toBe("Travado");
  });
});
