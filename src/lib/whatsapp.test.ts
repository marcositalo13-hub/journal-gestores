import { describe, expect, it } from "vitest";
import { mensagemCaderno, mensagemItem, primeiroNome, urlWhatsapp } from "./whatsapp";

describe("primeiroNome", () => {
  it("primeira palavra", () => {
    expect(primeiroNome("Solange Mata")).toBe("Solange");
    expect(primeiroNome("  João   Silva ")).toBe("João");
    expect(primeiroNome("TESTE")).toBe("TESTE");
  });
});

describe("mensagemItem", () => {
  it("atividade com prazo: formato pedido", () => {
    expect(mensagemItem({ nome: "Entrega do plano", tipo: "Entrega", data: "2026-10-17" }, "Lucas")).toBe(
      'Olá, Lucas. Sobre "Entrega do plano" (prazo 17/10): qual é a situação?',
    );
  });
  it("pagamento: 'Sobre o pagamento \"x\" de dd/mm'", () => {
    expect(mensagemItem({ nome: "Aluguel da sede", tipo: "Pagamento", data: "2026-10-09" }, "Keite")).toBe(
      'Olá, Keite. Sobre o pagamento "Aluguel da sede" de 09/10: qual é a situação?',
    );
  });
  it("item sem prazo: omite a data", () => {
    expect(mensagemItem({ nome: "X", tipo: "Atividade", data: null }, "Ana")).toBe('Olá, Ana. Sobre "X": qual é a situação?');
    expect(mensagemItem({ nome: "X", tipo: "Pagamento", data: null }, "Ana")).toBe('Olá, Ana. Sobre o pagamento "X": qual é a situação?');
  });
  it("nunca inclui o valor: a função nem recebe o campo, e um item com valor gera o mesmo texto", () => {
    const item = { nome: "Aluguel", tipo: "Pagamento", data: "2026-10-09", valor: 80000 };
    const msg = mensagemItem(item, "Keite");
    expect(msg).not.toMatch(/R\$|80\.?000|valor/i);
    expect(msg).toBe(mensagemItem({ nome: "Aluguel", tipo: "Pagamento", data: "2026-10-09" }, "Keite"));
  });
});

describe("mensagemCaderno", () => {
  it("mensagem genérica", () => expect(mensagemCaderno("Solange")).toBe("Olá, Solange. Pode me passar a situação das suas pendências?"));
});

describe("urlWhatsapp", () => {
  it("wa.me com texto codificado (acentos, aspas, espaços, símbolos)", () => {
    const msg = mensagemItem({ nome: "Plano & Metas #1", tipo: "Entrega", data: "2026-10-17" }, "João");
    const url = urlWhatsapp("5561999999999", msg);
    expect(url.startsWith("https://wa.me/5561999999999?text=")).toBe(true);
    const texto = url.split("?text=")[1];
    expect(texto).not.toMatch(/[\s"&#]/);
    expect(decodeURIComponent(texto)).toBe(msg);
    expect(texto).toContain("Jo%C3%A3o");
    expect(texto).toContain("%26"); // &
    expect(texto).toContain("%23"); // #
  });
});
