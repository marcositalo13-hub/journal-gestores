// Tutorial: lista de passos com âncoras ausentes, flags no localStorage e decisão de quando mostrar.
import { describe, expect, it } from "vitest";
import { chaveTour, construirPassos, decidir, lerEstado, marcarVisto, PASSOS, recusarOferta, reiniciar, type Ancora, type Armazem } from "./tour";

function armazem(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  const a: Armazem = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  return { a, m };
}
const todas = () => true;
const vistoTudo = { hoje: true, pagamentos: true, gestores: true };

describe("passos", () => {
  it("Hoje tem 6 passos na ordem do roteiro; Pagamentos e Gestores, 2", () => {
    expect(PASSOS.hoje.map((p) => p.ancora)).toEqual(["manchete", "legenda", "dias", "primeira-linha", "olho", "abas"]);
    expect(PASSOS.pagamentos.map((p) => p.ancora)).toEqual(["pag-aguardando", "pag-autorizados"]);
    expect(PASSOS.gestores.map((p) => p.ancora)).toEqual(["gestores-grade", "gestor-selo"]);
  });
  it("uma frase por passo, em português", () => {
    for (const p of Object.values(PASSOS).flat()) {
      expect(p.texto.trim()).not.toBe("");
      expect(p.titulo.trim()).not.toBe("");
    }
    expect(PASSOS.hoje[0].texto).toBe("Aqui fica o item mais urgente do dia.");
    expect(PASSOS.pagamentos[1].texto).toBe("Tudo o que você já autorizou, com busca.");
  });
  it("com todas as âncoras na tela, cada passo aponta para o seu [data-tour]", () => {
    const p = construirPassos("hoje", todas);
    expect(p.map((x) => x.seletor)).toEqual(["manchete", "legenda", "dias", "primeira-linha", "olho", "abas"].map((a) => `[data-tour="${a}"]`));
  });
  it("âncora ausente (ex.: sem itens hoje): o passo continua, sem destaque (centralizado)", () => {
    const sem = new Set<Ancora>(["manchete", "primeira-linha"]);
    const p = construirPassos("hoje", (a) => !sem.has(a));
    expect(p).toHaveLength(6);
    expect(p.map((x) => x.seletor === null)).toEqual([true, false, false, true, false, false]);
    expect(p[0].texto).toBe(PASSOS.hoje[0].texto);
    expect(construirPassos("gestores", () => false).every((x) => x.seletor === null)).toBe(true);
  });
  it("sem a aba Pagamentos na barra, o passo das abas não a cita", () => {
    const sem = construirPassos("hoje", (a) => a !== "aba-pagamentos").at(-1)!;
    expect(sem.texto).toBe("Gestores mostra cada área.");
    expect(construirPassos("hoje", todas).at(-1)!.texto).toMatch(/^Pagamentos traz o que depende da sua autorização/);
  });
});

describe("estado (localStorage)", () => {
  it("chaves pauta:tour:hoje|pagamentos|gestores com o valor 'visto'", () => {
    const { a, m } = armazem();
    marcarVisto(a, "hoje");
    expect([...m]).toEqual([["pauta:tour:hoje", "visto"]]);
    expect(chaveTour("gestores")).toBe("pauta:tour:gestores");
    expect(lerEstado(a)).toEqual({ hoje: true, pagamentos: false, gestores: false });
  });
  it("'Tutorial' limpa só os tours das abas; Hoje segue visto", () => {
    const { a } = armazem({ "pauta:tour:hoje": "visto", "pauta:tour:pagamentos": "visto", "pauta:tour:gestores": "visto" });
    reiniciar(a);
    expect(lerEstado(a)).toEqual({ hoje: true, pagamentos: false, gestores: false });
  });
  it("recusar a oferta marca os três como vistos", () => {
    const { a } = armazem();
    recusarOferta(a);
    expect(lerEstado(a)).toEqual(vistoTudo);
  });
  it("armazenamento bloqueado ou que lança: nada quebra e o estado é desconhecido (null)", () => {
    const ruim: Armazem = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
      removeItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(lerEstado(ruim)).toBeNull();
    expect(lerEstado(null)).toBeNull();
    expect(() => marcarVisto(ruim, "hoje")).not.toThrow();
    expect(() => reiniciar(ruim)).not.toThrow();
    expect(() => marcarVisto(null, "hoje")).not.toThrow();
  });
});

describe("decidir: quando mostrar", () => {
  const novo = { hoje: false, pagamentos: false, gestores: false };
  const vistoHoje = { hoje: true, pagamentos: false, gestores: false };
  it("primeiro acesso em Hoje: oferece; depois de visto, não", () => {
    expect(decidir({ rota: "/", estado: novo, ocupado: false })).toBe("oferecer");
    expect(decidir({ rota: "/", estado: vistoHoje, ocupado: false })).toBeNull();
  });
  it("nunca por cima da abertura animada, do cartão de notificações ou de uma folha aberta (ocupado)", () => {
    expect(decidir({ rota: "/", estado: novo, ocupado: true })).toBeNull();
    expect(decidir({ rota: "/pagamentos", estado: vistoHoje, ocupado: true })).toBeNull();
  });
  it("armazenamento ilegível: não se oferece sozinho", () => {
    expect(decidir({ rota: "/", estado: null, ocupado: false })).toBeNull();
  });
  it("tour de cada aba: só depois do de Hoje, uma vez por aba", () => {
    expect(decidir({ rota: "/pagamentos", estado: novo, ocupado: false })).toBeNull();
    expect(decidir({ rota: "/pagamentos", estado: vistoHoje, ocupado: false })).toBe("pagamentos");
    expect(decidir({ rota: "/pagamentos", estado: { ...vistoHoje, pagamentos: true }, ocupado: false })).toBeNull();
    expect(decidir({ rota: "/gestores", estado: vistoHoje, ocupado: false })).toBe("gestores");
    expect(decidir({ rota: "/gestores", estado: { ...vistoHoje, gestores: true }, ocupado: false })).toBeNull();
  });
  it("o caderno de um gestor e outras rotas não têm tour", () => {
    expect(decidir({ rota: "/gestores/maria-silva", estado: vistoHoje, ocupado: false })).toBeNull();
    expect(decidir({ rota: "/entrar", estado: vistoHoje, ocupado: false })).toBeNull();
  });
});
