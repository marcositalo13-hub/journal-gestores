// Tutorial: roteiro contínuo (capítulos, rótulos, âncoras ausentes, aba Pagamentos oculta) e a oferta do primeiro acesso.
import { describe, expect, it } from "vitest";
import { construirRoteiro, deveOferecer, indiceAnterior, marcarOfertaVista, mostrarVoltar, ofertaVista, resolverSeletor, rotuloProgresso, type Ancora, type Armazem } from "./tour";

const ids = (r: ReturnType<typeof construirRoteiro>) => r.map((p) => p.id);

describe("roteiro", () => {
  const r = construirRoteiro(true);

  it("Hoje (6) → Pagamentos (2) → Gestores (3), na ordem do roteiro", () => {
    expect(ids(r)).toEqual([
      "manchete", "legenda", "dias", "primeira-linha", "folha", "olho",
      "pag-aguardando", "pag-autorizados",
      "gestores-grade", "gestor-selo", "final",
    ]);
    expect(r.map((p) => p.rota)).toEqual(["/", "/", "/", "/", "/", "/", "/pagamentos", "/pagamentos", "/gestores", "/gestores", "/gestores"]);
  });

  it("progresso por capítulo: 'Hoje · 3 de 6', 'Pagamentos · 2 de 2', 'Gestores · 3 de 3'", () => {
    expect(rotuloProgresso(r[2])).toBe("Hoje · 3 de 6");
    expect(rotuloProgresso(r[5])).toBe("Hoje · 6 de 6");
    expect(rotuloProgresso(r[7])).toBe("Pagamentos · 2 de 2");
    expect(rotuloProgresso(r[10])).toBe("Gestores · 3 de 3");
  });

  it("botão principal: 'Próximo'; o último de cada capítulo leva ao seguinte; o final é 'Pronto'; o interativo não tem botão", () => {
    const botao = Object.fromEntries(r.map((p) => [p.id, p.botao]));
    expect(botao).toMatchObject({ manchete: "Próximo", legenda: "Próximo", folha: "Próximo", olho: "Ir para Pagamentos", "pag-autorizados": "Ir para Gestores", "gestor-selo": "Próximo", final: "Pronto", "primeira-linha": null });
  });

  it("tipos: interativo (toque no item), folha (detalhes) e final (centralizado, sem âncora)", () => {
    expect(r.filter((p) => p.tipo !== "normal").map((p) => [p.id, p.tipo])).toEqual([["primeira-linha", "interativo"], ["folha", "folha"], ["final", "final"]]);
    expect(r.find((p) => p.id === "final")!.ancoras).toEqual([]);
    expect(r.find((p) => p.id === "primeira-linha")!.texto).toBe("Toque neste item.");
    expect(r.find((p) => p.id === "final")!.texto).toBe("Pronto. Para rever, toque em Tutorial no fim da tela Hoje.");
  });

  it("uma frase curta por passo, em português", () => {
    for (const p of r) {
      expect(p.titulo.trim()).not.toBe("");
      expect(p.texto.trim().length).toBeGreaterThan(0);
      expect(p.texto.length).toBeLessThan(140);
    }
  });
});

describe("aba Pagamentos oculta pela config", () => {
  const r = construirRoteiro(false);
  it("o capítulo de Pagamentos é pulado e Hoje termina em 'Ir para Gestores'", () => {
    expect(ids(r)).toEqual(["manchete", "legenda", "dias", "primeira-linha", "folha", "olho", "gestores-grade", "gestor-selo", "final"]);
    expect(r.some((p) => p.rota === "/pagamentos")).toBe(false);
    expect(r.find((p) => p.id === "olho")!.botao).toBe("Ir para Gestores");
  });
});

describe("Voltar", () => {
  const r = construirRoteiro(true);
  it("escondido no primeiro passo de cada capítulo", () => {
    expect(r.filter((p) => !mostrarVoltar(p)).map((p) => p.id)).toEqual(["manchete", "pag-aguardando", "gestores-grade"]);
  });
  it("volta ao passo anterior do mesmo capítulo, pulando a folha (já fechada); nunca para outro capítulo", () => {
    const i = (id: string) => r.findIndex((p) => p.id === id);
    expect(indiceAnterior(r, i("legenda"))).toBe(i("manchete"));
    expect(indiceAnterior(r, i("folha"))).toBe(i("primeira-linha"));
    expect(indiceAnterior(r, i("olho"))).toBe(i("primeira-linha"));
    expect(indiceAnterior(r, i("pag-autorizados"))).toBe(i("pag-aguardando"));
    expect(indiceAnterior(r, i("manchete"))).toBeNull();
    expect(indiceAnterior(r, i("pag-aguardando"))).toBeNull();
    expect(indiceAnterior(r, i("gestores-grade"))).toBeNull();
    expect(indiceAnterior(r, 99)).toBeNull();
  });
});

describe("âncora ausente: popover centralizado, nunca aponta para o nada", () => {
  const r = construirRoteiro(true);
  const passo = (id: string) => r.find((p) => p.id === id)!;
  const sem = (...ausentes: Ancora[]) => (a: Ancora) => !ausentes.includes(a);

  it("presente: o seletor [data-tour]; ausente: null (sem destaque)", () => {
    expect(resolverSeletor(passo("manchete"), sem())).toBe('[data-tour="manchete"]');
    expect(resolverSeletor(passo("manchete"), sem("manchete"))).toBeNull(); // ex.: sem itens hoje
    expect(resolverSeletor(passo("primeira-linha"), sem("primeira-linha"))).toBeNull();
    expect(resolverSeletor(passo("pag-aguardando"), sem("pag-aguardando"))).toBeNull(); // nenhum pagamento
    expect(resolverSeletor(passo("gestor-selo"), sem("gestor-selo"))).toBeNull(); // ninguém com pendência
  });
  it("folha: o contato (WhatsApp / adicionar número); sem ele, o cabeçalho da folha; sem nada, centralizado", () => {
    expect(resolverSeletor(passo("folha"), sem())).toBe('[data-tour="folha-contato"]');
    expect(resolverSeletor(passo("folha"), sem("folha-contato"))).toBe('[data-tour="folha-cabecalho"]');
    expect(resolverSeletor(passo("folha"), sem("folha-contato", "folha-cabecalho"))).toBeNull();
  });
  it("o final nunca tem destaque", () => {
    expect(resolverSeletor(passo("final"), sem())).toBeNull();
  });
  it("com todas as âncoras ausentes, nenhum passo some", () => {
    expect(r.map((p) => resolverSeletor(p, () => false))).toEqual(r.map(() => null));
  });
});

describe("oferta do primeiro acesso (único estado: pauta:tour:hoje)", () => {
  function armazem(inicial: Record<string, string> = {}) {
    const m = new Map(Object.entries(inicial));
    const a: Armazem = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
    return { a, m };
  }
  it("marcar grava 'visto' só em pauta:tour:hoje; não há mais flags por aba", () => {
    const { a, m } = armazem();
    expect(ofertaVista(a)).toBe(false);
    marcarOfertaVista(a);
    expect([...m]).toEqual([["pauta:tour:hoje", "visto"]]);
    expect(ofertaVista(a)).toBe(true);
  });
  it("armazenamento bloqueado: nada quebra e a oferta não aparece sozinha", () => {
    const ruim: Armazem = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(ofertaVista(ruim)).toBeNull();
    expect(ofertaVista(null)).toBeNull();
    expect(() => marcarOfertaVista(ruim)).not.toThrow();
    expect(() => marcarOfertaVista(null)).not.toThrow();
    expect(deveOferecer({ rota: "/", vista: null, ocupado: false })).toBe(false);
  });
  it("só em Hoje, uma vez, e nunca por cima da abertura, do cartão de notificações ou de uma folha (ocupado)", () => {
    expect(deveOferecer({ rota: "/", vista: false, ocupado: false })).toBe(true);
    expect(deveOferecer({ rota: "/", vista: true, ocupado: false })).toBe(false);
    expect(deveOferecer({ rota: "/", vista: false, ocupado: true })).toBe(false);
    expect(deveOferecer({ rota: "/pagamentos", vista: false, ocupado: false })).toBe(false);
    expect(deveOferecer({ rota: "/gestores", vista: false, ocupado: false })).toBe(false);
  });
});
