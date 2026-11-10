// Autorizar / desfazer pagamentos: regras e orquestração, sem rede (ler/gravar injetados).
import { describe, expect, it, vi } from "vitest";
import { autorizar, desfazer, lerPagamentoDaApi, MSG, planejarAutorizacao, planejarDesfazer, textoJaAutorizado, type DepsAutorizacao, type PagamentoLido } from "./autorizacao";
import { getConfig, type Leitor } from "./config";
import { perguntaAutorizacao, textoAutorizado } from "./textos-pagamento";

const cfg = getConfig();
const PAG = "18434047675";
const EGIDIO: Leitor = { email: "egidio@x.com", nome: "Egídio" };
const MARCOS: Leitor = { email: "marcos@x.com", nome: "Marcos" };
// terça, 10/11/2026, 10:00 em São Paulo
const AGORA = new Date("2026-11-10T13:00:00Z");
const MIN = (m: number) => new Date(AGORA.getTime() - m * 60_000).toISOString();

const STATUS = { id: "st", type: "status", titulo: "Status", rotulos: [{ id: 0, nome: "Aguardando autorização" }, { id: 1, nome: "Autorizado" }, { id: 10, nome: "Cancelado" }] };
const pag = (o: Partial<PagamentoLido> = {}): PagamentoLido => ({
  id: "501",
  boardId: PAG,
  nome: "Aluguel da sede",
  status: "Aguardando autorização",
  statusAtualizadoEm: MIN(60),
  autorizadoPor: null,
  autorizadoEm: null,
  colunas: { status: STATUS, por: { id: "por", type: "text", titulo: "Autorizado por" }, em: { id: "em", type: "date", titulo: "Autorizado em" } },
  ...o,
});

function deps(p: PagamentoLido | null, leitor: Leitor | null = EGIDIO, o: Partial<DepsAutorizacao> = {}) {
  const gravar = vi.fn(async () => {});
  const ler = vi.fn(async () => p);
  return { d: { leitor, agora: AGORA, ler, gravar, cfg, ...o } as DepsAutorizacao, gravar, ler };
}

describe("autorizar: regras", () => {
  it("grava, numa chamada, Status = Autorizado (pelo ID do rótulo), Autorizado por = nome do leitor e Autorizado em = hoje (SP)", async () => {
    const { d, gravar } = deps(pag());
    const r = await autorizar("501", d);
    expect(r).toEqual({ ok: true, itemId: "501", nome: "Aluguel da sede", autorizadoPor: "Egídio", autorizadoEm: "2026-11-10" });
    expect(gravar).toHaveBeenCalledTimes(1);
    expect(gravar).toHaveBeenCalledWith(PAG, "501", { st: { index: 1 }, por: "Egídio", em: { date: "2026-11-10" } });
  });

  it("'hoje' é o de São Paulo: 01h UTC ainda é o dia anterior", () => {
    const pl = planejarAutorizacao(pag(), EGIDIO, new Date("2026-11-11T01:00:00Z"), cfg);
    expect(pl.ok && pl.valores.em).toEqual({ date: "2026-11-10" });
  });

  it("rejeita quem não é leitor, sem nem consultar o monday", async () => {
    const { d, ler, gravar } = deps(pag(), null);
    expect(await autorizar("501", d)).toEqual({ ok: false, erro: MSG.semLeitor });
    expect(ler).not.toHaveBeenCalled();
    expect(gravar).not.toHaveBeenCalled();
  });

  it("rejeita item de outro quadro (ex.: Atividades), item inexistente e id malformado", async () => {
    for (const p of [pag({ boardId: "18438464813" }), null]) {
      const { d, gravar } = deps(p);
      expect(await autorizar("501", d)).toEqual({ ok: false, erro: MSG.naoEhPagamento });
      expect(gravar).not.toHaveBeenCalled();
    }
    const { d, ler } = deps(pag());
    expect(await autorizar("501; drop", d)).toEqual({ ok: false, erro: MSG.naoEhPagamento });
    expect(ler).not.toHaveBeenCalled();
  });

  it("rejeita já autorizado, com quem e quando", async () => {
    const { d, gravar } = deps(pag({ status: "Autorizado", autorizadoPor: "Marcos", autorizadoEm: "2026-11-09" }));
    expect(await autorizar("501", d)).toEqual({ ok: false, erro: "Este pagamento já foi autorizado por Marcos em 09/11." });
    expect(gravar).not.toHaveBeenCalled();
    expect(textoJaAutorizado({ autorizadoPor: null, autorizadoEm: null })).toBe("Este pagamento já foi autorizado.");
  });

  it("rejeita cancelado e qualquer Status diferente de 'Aguardando autorização' (inclusive vazio e o rótulo antigo)", () => {
    expect(planejarAutorizacao(pag({ status: "Cancelado" }), EGIDIO, AGORA, cfg)).toEqual({ ok: false, erro: MSG.cancelado });
    for (const status of [null, "Aguardando aprovação", "Aprovado"]) {
      const pl = planejarAutorizacao(pag({ status }), EGIDIO, AGORA, cfg);
      expect(pl.ok).toBe(false);
      expect(!pl.ok && pl.erro).toMatch(/não é "Aguardando autorização"/);
    }
  });

  it("colunas ou rótulo ausentes no quadro: mensagem clara e nada gravado", () => {
    expect(planejarAutorizacao(pag({ colunas: { ...pag().colunas, por: null } }), EGIDIO, AGORA, cfg)).toEqual({ ok: false, erro: expect.stringMatching(/"Autorizado por"/) });
    expect(planejarAutorizacao(pag({ colunas: { ...pag().colunas, em: null } }), EGIDIO, AGORA, cfg)).toEqual({ ok: false, erro: expect.stringMatching(/"Autorizado em"/) });
    const semRotulo = { ...STATUS, rotulos: STATUS.rotulos.filter((r) => r.nome !== "Autorizado") };
    expect(planejarAutorizacao(pag({ colunas: { ...pag().colunas, status: semRotulo } }), EGIDIO, AGORA, cfg)).toEqual({ ok: false, erro: expect.stringMatching(/rótulo "Autorizado"/) });
  });

  it("falha do monday: na leitura ou na gravação, devolve erro (nada a mostrar como autorizado)", async () => {
    const a = deps(pag(), EGIDIO, { ler: vi.fn(async () => Promise.reject(new Error("timeout"))) });
    expect(await autorizar("501", a.d)).toEqual({ ok: false, erro: MSG.semMonday });
    expect(a.gravar).not.toHaveBeenCalled();
    const b = deps(pag(), EGIDIO, { gravar: vi.fn(async () => Promise.reject(new Error("HTTP 500"))) });
    expect(await autorizar("501", b.d)).toEqual({ ok: false, erro: MSG.gravacao });
  });
});

describe("desfazer: só quem autorizou e só por 10 minutos", () => {
  const autorizado = (o: Partial<PagamentoLido> = {}) => pag({ status: "Autorizado", autorizadoPor: "Egídio", autorizadoEm: "2026-11-10", statusAtualizadoEm: MIN(2), ...o });

  it("volta o Status para 'Aguardando autorização' e limpa as duas colunas, numa chamada", async () => {
    const { d, gravar } = deps(autorizado());
    expect(await desfazer("501", d)).toEqual({ ok: true, itemId: "501", nome: "Aluguel da sede" });
    expect(gravar).toHaveBeenCalledWith(PAG, "501", { st: { index: 0 }, por: "", em: null });
  });

  it("janela: 10 minutos inclusive; depois disso, não", () => {
    expect(planejarDesfazer(autorizado({ statusAtualizadoEm: MIN(10) }), EGIDIO, AGORA, cfg).ok).toBe(true);
    expect(planejarDesfazer(autorizado({ statusAtualizadoEm: MIN(10.05) }), EGIDIO, AGORA, cfg)).toEqual({ ok: false, erro: MSG.prazoDesfazer });
    expect(planejarDesfazer(autorizado({ statusAtualizadoEm: null }), EGIDIO, AGORA, cfg)).toEqual({ ok: false, erro: MSG.prazoDesfazer });
  });

  it("outro leitor não desfaz", async () => {
    const { d, gravar } = deps(autorizado(), MARCOS);
    expect(await desfazer("501", d)).toEqual({ ok: false, erro: "Só Egídio pode desfazer esta autorização." });
    expect(gravar).not.toHaveBeenCalled();
    expect(planejarDesfazer(autorizado({ autorizadoPor: null }), EGIDIO, AGORA, cfg)).toEqual({ ok: false, erro: "Só quem autorizou pode desfazer esta autorização." });
  });

  it("não leitor, outro quadro e item que não está autorizado", async () => {
    expect(await desfazer("501", deps(autorizado(), null).d)).toEqual({ ok: false, erro: MSG.semLeitor });
    expect(await desfazer("501", deps(autorizado({ boardId: "1" })).d)).toEqual({ ok: false, erro: MSG.naoEhPagamento });
    expect(await desfazer("501", deps(pag()).d)).toEqual({ ok: false, erro: MSG.naoAutorizado });
  });
});

describe("leitura da API (colunas pelo título)", () => {
  const api = {
    id: "501",
    name: "Aluguel",
    board: {
      id: PAG,
      columns: [
        { id: "color_x", title: "Status", type: "status", settings_str: JSON.stringify({ labels: { "0": "Aguardando autorização", "1": "Autorizado" } }) },
        { id: "text_p", title: "Autorizado por", type: "text" },
        { id: "date_e", title: "Autorizado em", type: "date" },
      ],
    },
    column_values: [
      { id: "color_x", text: "Autorizado", label: "Autorizado", updated_at: "2026-11-10T12:58:00Z" },
      { id: "text_p", text: "Egídio" },
      { id: "date_e", text: "2026-11-10", date: "2026-11-10" },
    ],
  };
  it("status, quando mudou, quem e quando autorizou, e os ids das colunas", () => {
    const p = lerPagamentoDaApi(api, cfg)!;
    expect(p).toMatchObject({ id: "501", boardId: PAG, status: "Autorizado", statusAtualizadoEm: "2026-11-10T12:58:00Z", autorizadoPor: "Egídio", autorizadoEm: "2026-11-10" });
    expect(p.colunas.status?.rotulos?.map((r) => r.nome)).toEqual(["Aguardando autorização", "Autorizado"]);
    expect([p.colunas.por?.id, p.colunas.em?.id]).toEqual(["text_p", "date_e"]);
  });
  it("sem as colunas novas (quadro ainda não migrado) as colunas vêm null", () => {
    const p = lerPagamentoDaApi({ ...api, board: { ...api.board, columns: [api.board.columns[0]] } }, cfg)!;
    expect(p.colunas.por).toBeNull();
    expect(p.colunas.em).toBeNull();
    expect(lerPagamentoDaApi(undefined, cfg)).toBeNull();
  });
});

describe("textos da interface", () => {
  it("confirmação traz nome, valor (sempre visível) e vencimento", () => {
    expect(perguntaAutorizacao({ nome: "Aluguel da sede", valor: 80000, data: "2026-11-13" })).toBe("Autorizar Aluguel da sede — R$ 80.000,00 — vence 13/11?");
    expect(perguntaAutorizacao({ nome: "X", data: null })).toBe("Autorizar X — sem vencimento?");
  });
  it("linha do histórico: 'Autorizado por {nome} em {dd/mm}'", () => {
    expect(textoAutorizado({ autorizadoPor: "Egídio", autorizadoEm: "2026-11-10" })).toBe("Autorizado por Egídio em 10/11");
    expect(textoAutorizado({})).toBe("Autorizado");
  });
});
