import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import raw from "../../../config/jornal.config.json";
import { getConfig, validarConfig } from "../config";
import { montarPayload, temValor } from "../push/payload";
import { agrupar, nomeDoCorpo, planejarEnvios, textoResumo, type Pendente } from "./agrupar";
import { dentroDaJanela, inicioDaJanelaDeHoje } from "./janela";
import { enviarPendentes, processarEvento, resumoDaManha, tratarEProcessar, type DepsNotificacoes, type ItemRelido, type RepoFila } from "./orquestrar";
import { avaliarRegras, type EventoItem, type ItemParaRegras, type NotificacaoFila } from "./regras";
import { tokenConfere, tratarWebhook } from "./webhook";

const cfgOculta = getConfig(); // abas.pagamentos = false (estado atual)
const cfg = validarConfig({ ...raw, abas: { pagamentos: true, previa_para: [] } }); // link do pagamento testado com a aba visível
const RAIZ = resolve(__dirname, "../../..");
// terça, 10/11/2026, 10:00 em São Paulo
const AGORA = new Date("2026-11-10T13:00:00Z");
const HORAS = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();
const criado: EventoItem = { tipo: "criado" };
const coluna = (titulo: string): EventoItem => ({ tipo: "coluna", titulo });

const ativ = (o: Partial<ItemParaRegras> = {}): ItemParaRegras => ({
  id: "101",
  nome: "Conciliação bancária",
  tipoQuadro: "atividades",
  tipo: "Atividade",
  categoria: "aberto",
  data: "2026-11-10",
  criadoEm: HORAS(1),
  geradoPeloColetor: false,
  finalizada: false,
  dono: "Keite Martins",
  ...o,
});
const pag = (o: Partial<ItemParaRegras> = {}): ItemParaRegras => ({
  id: "201",
  nome: "Aluguel da sede",
  tipoQuadro: "pagamentos",
  tipo: "Pagamento",
  categoria: "aberto",
  data: "2026-11-13",
  criadoEm: HORAS(1),
  geradoPeloColetor: false,
  finalizada: false,
  dono: "Egídio",
  ...o,
});
const regras = (ns: NotificacaoFila[]) => ns.map((n) => n.regra);
const av = (e: EventoItem, i: ItemParaRegras, agora = AGORA) => avaliarRegras(e, i, agora, cfg);

describe("R1: nova para hoje/amanhã", () => {
  it("criada agora com prazo hoje ou amanhã", () => {
    expect(av(criado, ativ())).toEqual([
      { chave_dedupe: "R1:101", regra: "R1", prioridade: "normal", titulo: "Nova para hoje", corpo: "Adm. e Financeira: Conciliação bancária", url: "/?item=101", item_id: "101" },
    ]);
    expect(av(criado, ativ({ data: "2026-11-11" }))[0].titulo).toBe("Nova para amanhã");
  });
  it("prazo posto depois de criada (coluna Prazo) também conta", () => {
    expect(regras(av(coluna("Prazo"), ativ()))).toEqual(["R1"]);
  });
  it("não: prazo depois de amanhã, sem prazo, criada há mais de 24h, concluída", () => {
    expect(av(criado, ativ({ data: "2026-11-12" }))).toEqual([]);
    expect(av(criado, ativ({ data: null }))).toEqual([]);
    expect(av(criado, ativ({ criadoEm: HORAS(25) }))).toEqual([]);
    expect(av(criado, ativ({ categoria: "concluido" }))).toEqual([]);
  });
  it("não: item criado pelo coletor (tem Chave), item em finalizadas, quadro de pagamentos", () => {
    expect(av(criado, ativ({ geradoPeloColetor: true }))).toEqual([]);
    expect(av(coluna("Prazo"), ativ({ geradoPeloColetor: true }))).toEqual([]);
    expect(av(criado, ativ({ finalizada: true }))).toEqual([]);
    expect(regras(av(criado, pag({ data: "2026-11-10" })))).toEqual(["R3"]); // pagamento tem a própria regra (R3), nunca a R1
  });
  it("não: mudanças em colunas que não são Prazo", () => {
    expect(av(coluna("Área"), ativ())).toEqual([]);
    expect(av(coluna("Observação"), ativ())).toEqual([]);
  });
});

describe("R2: travado", () => {
  it("Status virou Travado em atividades (pagamentos não têm esse status)", () => {
    const a = av(coluna("Status"), ativ({ categoria: "travado", criadoEm: HORAS(500), data: "2026-12-30" }));
    expect(a).toEqual([expect.objectContaining({ regra: "R2", prioridade: "normal", titulo: "Travado", corpo: "Adm. e Financeira: Conciliação bancária", chave_dedupe: "R2:101:2026-11-10" })]);
    expect(regras(av(coluna("Status"), pag({ categoria: "travado" })))).toEqual([]);
  });
  it("travado por uma pessoa num item do coletor conta; criado já travado pelo coletor não", () => {
    expect(regras(av(coluna("Status"), ativ({ categoria: "travado", geradoPeloColetor: true, data: "2026-12-30" })))).toEqual(["R2"]);
    expect(av(criado, ativ({ categoria: "travado", geradoPeloColetor: true }))).toEqual([]);
  });
  it("não: Status mudou para outro rótulo; item em finalizadas", () => {
    expect(av(coluna("Status"), ativ({ categoria: "aberto", data: "2026-12-30" }))).toEqual([]);
    expect(av(coluna("Status"), ativ({ categoria: "travado", finalizada: true }))).toEqual([]);
  });
});

describe("R3: pagamento novo aguardando aprovação", () => {
  it("criado: imediata, título 'Aprovação pendente', corpo 'nome · vence dd/mm', sem valor", () => {
    expect(av(criado, pag())).toEqual([
      { chave_dedupe: "R3:201", regra: "R3", prioridade: "imediata", titulo: "Aprovação pendente", corpo: "Aluguel da sede · vence 13/11", url: "/pagamentos?item=201", item_id: "201" },
    ]);
  });
  it("o item das regras nem carrega valor; um nome com valor sai limpo e o payload passa na trava", () => {
    const [n] = av(criado, pag({ nome: "Fornecedor X R$ 120.000,00" }));
    expect(n.corpo).toBe("Fornecedor X · vence 13/11");
    expect(temValor(n.titulo + n.corpo)).toBe(false);
    expect(() => montarPayload({ titulo: n.titulo, corpo: n.corpo, tag: "t", url: n.url })).not.toThrow();
    const [m] = av(criado, pag({ nome: "Parcela 150.000,00 do convênio" }));
    expect(temValor(m.corpo)).toBe(false);
  });
  it("qualquer vencimento vale (vencido, hoje ou longe): só importa ser novo e aguardar aprovação", () => {
    expect(regras(av(criado, pag({ data: "2026-11-09" })))).toEqual(["R3"]);
    expect(regras(av(criado, pag({ data: "2027-03-01" })))).toEqual(["R3"]);
  });
  it("Vencimento ou Status preenchidos depois da criação (o webhook de criação chega antes) também disparam, com a mesma chave", () => {
    expect(regras(av(coluna("Vencimento"), pag()))).toEqual(["R3"]);
    expect(av(coluna("Status"), pag())[0].chave_dedupe).toBe(av(criado, pag())[0].chave_dedupe);
  });
  it("não: sem vencimento, criado há mais de 24h, aprovado, cancelado, valor ou observação mudaram, item do coletor", () => {
    expect(av(criado, pag({ data: null }))).toEqual([]);
    expect(av(criado, pag({ criadoEm: HORAS(25) }))).toEqual([]);
    expect(av(criado, pag({ categoria: "concluido" }))).toEqual([]);
    expect(av(criado, pag({ categoria: "cancelado" }))).toEqual([]);
    expect(av(coluna("Valor (R$)"), pag())).toEqual([]);
    expect(av(coluna("Observação"), pag())).toEqual([]);
    expect(av(criado, pag({ geradoPeloColetor: true }))).toEqual([]);
  });
});

describe("R4: contrato", () => {
  it("contrato novo, qualquer prazo, é imediato e não repete como R1", () => {
    expect(av(criado, ativ({ tipo: "Contrato", data: "2027-03-01" }))).toEqual([
      expect.objectContaining({ regra: "R4", prioridade: "imediata", titulo: "Contrato para análise", corpo: "Adm. e Financeira: Conciliação bancária · prazo 01/03", chave_dedupe: "R4:101" }),
    ]);
    expect(regras(av(criado, ativ({ tipo: "Contrato" })))).toEqual(["R4"]); // prazo hoje: R4 só
  });
  it("sem prazo: omite o prazo; Tipo virou Contrato logo após criado também conta", () => {
    expect(av(criado, ativ({ tipo: "Contrato", data: null }))[0].corpo).toBe("Adm. e Financeira: Conciliação bancária");
    expect(regras(av(coluna("Tipo"), ativ({ tipo: "Contrato", data: null, criadoEm: HORAS(23) })))).toEqual(["R4"]);
  });
  it("não: criado há mais de 24h, gerado pelo coletor, concluído", () => {
    expect(av(coluna("Tipo"), ativ({ tipo: "Contrato", criadoEm: HORAS(25) }))).toEqual([]);
    expect(av(criado, ativ({ tipo: "Contrato", geradoPeloColetor: true }))).toEqual([]);
    expect(av(criado, ativ({ tipo: "Contrato", categoria: "concluido" }))).toEqual([]);
  });
});

describe("nenhum texto leva valores", () => {
  it("nomes com valores são limpos e todo payload passa na trava", () => {
    const sujo = { nome: "Aluguel R$ 120.000,00 sede" };
    const ns = [
      ...av(criado, pag(sujo)),
      ...av(coluna("Status"), ativ({ ...sujo, categoria: "travado", data: "2026-12-30" })),
      ...av(criado, ativ({ nome: "Contrato de R$ 1.200,50 com fornecedor", tipo: "Contrato" })),
      ...av(criado, ativ({ nome: "Pagar 99,90 de taxa" })),
    ];
    expect(ns.length).toBe(4);
    for (const n of ns) {
      expect(temValor(n.titulo)).toBe(false);
      expect(temValor(n.corpo)).toBe(false);
      expect(() => montarPayload({ titulo: n.titulo, corpo: n.corpo, tag: "t", url: n.url })).not.toThrow();
    }
    expect(ns[0].corpo).toBe("Aluguel sede · vence 13/11");
    const g = agrupar(ns.map((n, k) => ({ ...n, id: String(k), criado_em: AGORA.toISOString() })));
    expect(temValor(g.titulo + g.corpo)).toBe(false);
    expect(temValor(textoResumo({ hoje: 3, atrasados: 2, noite: 4 }))).toBe(false);
  });
});

describe("janela 07:00–20:00 (São Paulo)", () => {
  const sp = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00-03:00`);
  it("06:59 fora; 07:00 dentro; 20:00 dentro; 20:01 fora", () => {
    expect(dentroDaJanela(sp("06:59"), cfg)).toBe(false);
    expect(dentroDaJanela(sp("07:00"), cfg)).toBe(true);
    expect(dentroDaJanela(sp("20:00"), cfg)).toBe(true);
    expect(dentroDaJanela(sp("20:01"), cfg)).toBe(false);
  });
  it("início da janela de hoje = 07:00 de São Paulo (10:00 UTC)", () => {
    expect(inicioDaJanelaDeHoje(sp("15:42"), cfg).toISOString()).toBe("2026-11-10T10:00:00.000Z");
  });
  it("crons do vercel.json em UTC: envio a cada 5 min das 10h às 23h59 (07h–20h55 em SP) e resumo às 10:00 UTC", () => {
    const v = JSON.parse(readFileSync(resolve(RAIZ, "vercel.json"), "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(v.crons).toEqual(
      expect.arrayContaining([
        { path: "/api/cron/coletar", schedule: "0 9-23 * * *" },
        { path: "/api/cron/notificar", schedule: "*/5 10-23 * * *" },
        { path: "/api/cron/resumo", schedule: "0 10 * * *" },
      ]),
    );
  });
});

const pend = (id: string, o: Partial<Pendente> = {}): Pendente => ({
  id,
  prioridade: "normal",
  titulo: "Travado",
  corpo: `Controladoria: Item ${id}`,
  url: `/?item=${id}`,
  item_id: id,
  criado_em: `2026-11-10T12:0${id}:00Z`,
  ...o,
});

describe("agrupamento", () => {
  it("um item vai como está, com tag do item", () => {
    expect(agrupar([pend("1")])).toEqual({ titulo: "Travado", corpo: "Controladoria: Item 1", tag: "item-1", url: "/?item=1", ids: ["1"] });
  });
  it("vários: '{n} novidades', até 3 linhas '{título}: {nome}' e 'e mais {k}', tag grupo", () => {
    const g = agrupar(["1", "2", "3", "4", "5"].map((id) => pend(id)));
    expect(g.titulo).toBe("5 novidades");
    expect(g.corpo).toBe("Travado: Item 1\nTravado: Item 2\nTravado: Item 3\ne mais 2");
    expect(g.tag).toBe("grupo");
    expect(g.url).toBe("/");
    expect(agrupar([pend("1"), pend("2")]).corpo).toBe("Travado: Item 1\nTravado: Item 2");
  });
  it("nome a partir do corpo (sem o prefixo e sem o prazo)", () => {
    expect(nomeDoCorpo("Controladoria: Revisão: fase 2 · prazo 13/11")).toBe("Revisão: fase 2");
  });
  it("normais esperam agrupar_minutos desde o último envio normal; imediatas nunca esperam", () => {
    const ps = [pend("1"), pend("2", { prioridade: "imediata", titulo: "Contrato para análise" })];
    const ha = (min: number) => new Date(AGORA.getTime() - min * 60_000);
    const e14 = planejarEnvios(ps, ha(14), AGORA, cfg);
    expect(e14.map((e) => e.ids)).toEqual([["2"]]);
    const e15 = planejarEnvios(ps, ha(15), AGORA, cfg);
    expect(e15.map((e) => e.ids)).toEqual([["2"], ["1"]]);
    expect(planejarEnvios(ps, null, AGORA, cfg).length).toBe(2);
  });
  it("resumo: só contagens, singular e plural", () => {
    expect(textoResumo({ hoje: 3, atrasados: 2, noite: 4 })).toBe("3 itens hoje · 2 atrasados · 4 novidades da noite");
    expect(textoResumo({ hoje: 1, atrasados: 1, noite: 1 })).toBe("1 item hoje · 1 atrasado · 1 novidade da noite");
    expect(textoResumo({ hoje: null, atrasados: null, noite: 0 })).toBe("0 novidades da noite");
  });
});

/** Fila em memória com a mesma regra do banco: chave_dedupe única (ON CONFLICT DO NOTHING). */
function repoMemoria() {
  const linhas: (NotificacaoFila & { id: string; criado_em: string; enviado_em: string | null })[] = [];
  let seq = 0;
  let relogio = AGORA.getTime();
  const repo: RepoFila = {
    async inserir(ns) {
      for (const n of ns) {
        if (linhas.some((l) => l.chave_dedupe === n.chave_dedupe)) continue;
        linhas.push({ ...n, id: String(++seq), criado_em: new Date(relogio).toISOString(), enviado_em: null });
      }
    },
    async pendentes({ desde, antes }) {
      return linhas.filter((l) => !l.enviado_em && (!desde || l.criado_em >= desde.toISOString()) && (!antes || l.criado_em < antes.toISOString()));
    },
    async ultimoEnvioNormal() {
      const v = linhas.filter((l) => l.prioridade === "normal" && l.enviado_em).map((l) => l.enviado_em!).sort().at(-1);
      return v ? new Date(v) : null;
    },
    async reivindicar(ids, quando) {
      const out: string[] = [];
      for (const l of linhas) {
        if (ids.includes(l.id) && !l.enviado_em) {
          l.enviado_em = quando.toISOString();
          out.push(l.id);
        }
      }
      return out;
    },
  };
  return { repo, linhas, emHorario: (d: Date) => (relogio = d.getTime()) };
}

function depsTeste(relido: ItemRelido | null) {
  const mem = repoMemoria();
  const enviados: { title: string; body: string; tag: string; url: string }[] = [];
  const deps: DepsNotificacoes = {
    repo: mem.repo,
    enviarATodos: vi.fn(async (p: string) => void enviados.push(JSON.parse(p))),
    relerItem: vi.fn(async () => relido),
    contagens: vi.fn(async () => ({ hoje: 3, atrasados: 2 })),
    log: vi.fn(),
  };
  return { deps, enviados, ...mem };
}
const relido = (item: ItemParaRegras | null, tipoQuadro: "atividades" | "pagamentos" = "atividades"): ItemRelido => ({
  item,
  tipoQuadro,
  tituloDaColuna: (id) => ({ status: "Status", prazo: "Prazo", area: "Área", chave: "Chave", obs: "Observação", tipo: "Tipo" })[id] ?? null,
});
const ev = (o: Partial<{ tipo: "create_pulse" | "update_column_value"; columnId: string }> = {}) => ({ tipo: "create_pulse" as const, boardId: "18438464813", itemId: "101", ...o });

describe("processarEvento (webhook → fila)", () => {
  it("dedupe: o mesmo evento duas vezes (reenvio da monday) entra uma vez só na fila", async () => {
    const t = depsTeste(relido(ativ({ categoria: "travado", data: "2026-12-30" })));
    await processarEvento(ev({ tipo: "update_column_value", columnId: "status" }), AGORA, t.deps, cfg);
    await processarEvento(ev({ tipo: "update_column_value", columnId: "status" }), AGORA, t.deps, cfg);
    expect(t.linhas.map((l) => l.chave_dedupe)).toEqual(["R2:101:2026-11-10"]);
  });
  it("ignora Área, Chave, Observação e colunas desconhecidas (inclusive as gravadas pelo coletor)", async () => {
    const t = depsTeste(relido(ativ({ categoria: "travado" })));
    for (const c of ["area", "chave", "obs", "mes"]) await processarEvento(ev({ tipo: "update_column_value", columnId: c }), AGORA, t.deps, cfg);
    expect(t.linhas).toEqual([]);
  });
  it("ignora regras recorrentes/modelos (item que não entra na edição) e itens fora do config", async () => {
    const t = depsTeste(relido(null));
    expect(await processarEvento(ev(), AGORA, t.deps, cfg)).toEqual([]);
    const u = depsTeste(null);
    expect(await processarEvento(ev(), AGORA, u.deps, cfg)).toEqual([]);
  });
  it("imediata (R4) dentro da janela é enviada na hora, uma notificação, com tag do item", async () => {
    const t = depsTeste(relido(ativ({ tipo: "Contrato" })));
    await processarEvento(ev(), AGORA, t.deps, cfg);
    expect(t.enviados).toEqual([{ title: "Contrato para análise", body: "Adm. e Financeira: Conciliação bancária · prazo 10/11", tag: "item-101", url: "/?item=101" }]);
    expect(t.linhas[0].enviado_em).not.toBeNull();
  });
  it("imediata fora da janela fica na fila (vai para o resumo da manhã); normal nunca sai pelo webhook", async () => {
    const noite = new Date("2026-11-10T23:30:00Z"); // 20:30 em SP
    const t = depsTeste(relido(ativ({ tipo: "Contrato", criadoEm: new Date(noite.getTime() - 60_000).toISOString() })));
    await processarEvento(ev(), noite, t.deps, cfg);
    expect(t.enviados).toEqual([]);
    expect(t.linhas[0].enviado_em).toBeNull();
    const n = depsTeste(relido(ativ()));
    await processarEvento(ev(), AGORA, n.deps, cfg);
    expect(n.enviados).toEqual([]);
  });
});

describe("cron de envio e resumo da manhã", () => {
  it("fora da janela não faz nada", async () => {
    const t = depsTeste(null);
    await t.repo.inserir([{ chave_dedupe: "x", regra: "R2", prioridade: "normal", titulo: "Travado", corpo: "A: b", url: "/?item=1", item_id: "1" }]);
    expect(await enviarPendentes(new Date("2026-11-10T09:59:00Z"), t.deps, cfg)).toEqual({ enviados: 0, foraDaJanela: true });
    expect(t.enviados).toEqual([]);
  });
  it("dentro: agrupa as normais num envio só e marca enviado; não reenvia na rodada seguinte", async () => {
    const t = depsTeste(null);
    t.emHorario(new Date("2026-11-10T12:50:00Z"));
    for (const k of ["1", "2", "3"]) await t.repo.inserir([{ chave_dedupe: `R2:${k}`, regra: "R2", prioridade: "normal", titulo: "Travado", corpo: `Contábil: Item ${k}`, url: `/?item=${k}`, item_id: k }]);
    await enviarPendentes(AGORA, t.deps, cfg);
    expect(t.enviados).toEqual([{ title: "3 novidades", body: "Travado: Item 1\nTravado: Item 2\nTravado: Item 3", tag: "grupo", url: "/" }]);
    await enviarPendentes(new Date(AGORA.getTime() + 20 * 60_000), t.deps, cfg);
    expect(t.enviados.length).toBe(1);
  });
  it("o que chegou à noite não sai no cron das 07h: fica para o resumo, que marca tudo como enviado", async () => {
    const t = depsTeste(null);
    t.emHorario(new Date("2026-11-10T02:00:00Z")); // 23:00 em SP do dia 9
    await t.repo.inserir([{ chave_dedupe: "a", regra: "R2", prioridade: "normal", titulo: "Travado", corpo: "A: b", url: "/?item=1", item_id: "1" }]);
    await t.repo.inserir([{ chave_dedupe: "b", regra: "R4", prioridade: "imediata", titulo: "Contrato para análise", corpo: "A: c", url: "/?item=2", item_id: "2" }]);
    const sete = new Date("2026-11-10T10:00:00Z");
    await enviarPendentes(sete, t.deps, cfg);
    expect(t.enviados).toEqual([]);
    const r = await resumoDaManha(sete, t.deps, cfg);
    expect(r.noite).toBe(2);
    expect(t.enviados).toEqual([{ title: "Bom dia", body: "3 itens hoje · 2 atrasados · 2 novidades da noite", tag: "resumo", url: "/" }]);
    expect(t.linhas.every((l) => l.enviado_em)).toBe(true);
  });
  it("resumo sobrevive à monday fora do ar (só a contagem da noite)", async () => {
    const t = depsTeste(null);
    t.deps.contagens = async () => {
      throw new Error("monday");
    };
    expect((await resumoDaManha(new Date("2026-11-10T10:00:00Z"), t.deps, cfg)).corpo).toBe("0 novidades da noite");
  });
});

describe("webhook invalida o cache da edição", () => {
  const S = "a".repeat(64);
  const corpo = (id: string, coluna = "status") => JSON.stringify({ event: { type: "update_column_value", boardId: 18438464813, pulseId: Number(id), columnId: coluna } });
  it("evento válido: invalida ao fim, com ou sem notificação na fila", async () => {
    for (const relido_ of [relido(ativ({ categoria: "travado", data: "2026-12-30" })), null]) {
      const t = depsTeste(relido_);
      const invalidar = vi.fn();
      const { resposta, trabalho } = tratarEProcessar(corpo("101"), S, S, cfg, AGORA, t.deps, invalidar);
      expect(resposta.status).toBe(200);
      expect(invalidar).not.toHaveBeenCalled(); // só depois do trabalho
      await trabalho!();
      expect(invalidar).toHaveBeenCalledTimes(1);
    }
  });
  it("invalida mesmo quando a releitura falha", async () => {
    const t = depsTeste(null);
    t.deps.relerItem = async () => Promise.reject(new Error("monday fora"));
    const invalidar = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await tratarEProcessar(corpo("101"), S, S, cfg, AGORA, t.deps, invalidar).trabalho!();
    expect(invalidar).toHaveBeenCalledTimes(1);
  });
  it("token inválido, ausente ou segredo não configurado: nada a processar e nada invalidado", () => {
    const t = depsTeste(null);
    const invalidar = vi.fn();
    for (const [token, segredo] of [["errado", S], [null, S], [S, undefined]] as const) {
      const r = tratarEProcessar(corpo("101"), token, segredo, cfg, AGORA, t.deps, invalidar);
      expect(r.trabalho).toBeNull();
      expect(r.resposta.status).not.toBe(200);
    }
    expect(invalidar).not.toHaveBeenCalled();
  });
});

describe("webhook: token, handshake e filtro", () => {
  const S = "a".repeat(64);
  const corpo = (o: unknown) => JSON.stringify(o);
  it("token: só o igual passa (tempo constante)", () => {
    expect(tokenConfere(S, S)).toBe(true);
    expect(tokenConfere("b".repeat(64), S)).toBe(false);
    expect(tokenConfere("curto", S)).toBe(false);
    expect(tokenConfere(null, S)).toBe(false);
    expect(tokenConfere(S, undefined)).toBe(false);
  });
  it("recusa token errado ou ausente (401) e segredo não configurado (503), antes de olhar o corpo", () => {
    expect(tratarWebhook(corpo({ challenge: "x" }), "errado", S, cfg).status).toBe(401);
    expect(tratarWebhook(corpo({ challenge: "x" }), null, S, cfg).status).toBe(401);
    expect(tratarWebhook(corpo({ challenge: "x" }), S, undefined, cfg).status).toBe(503);
  });
  it("handshake: devolve o mesmo challenge", () => {
    expect(tratarWebhook(corpo({ challenge: "abc123" }), S, S, cfg)).toMatchObject({ status: 200, corpo: { challenge: "abc123" } });
    expect(tratarWebhook(corpo({ challenge: "abc123" }), S, S, cfg).evento).toBeUndefined();
  });
  it("evento de quadro do config vira trabalho; quadro fora do config, ignorado (200)", () => {
    const r = tratarWebhook(corpo({ event: { type: "update_column_value", boardId: 18438464813, pulseId: 101, columnId: "status", value: { label: { text: "Travado" } } } }), S, S, cfg);
    expect(r).toMatchObject({ status: 200, evento: { tipo: "update_column_value", boardId: "18438464813", itemId: "101", columnId: "status" } });
    expect(tratarWebhook(corpo({ event: { type: "create_pulse", boardId: 18434048054, pulseId: 1 } }), S, S, cfg)).toMatchObject({ status: 200 });
    expect(tratarWebhook(corpo({ event: { type: "create_pulse", boardId: 18434048054, pulseId: 1 } }), S, S, cfg).evento).toBeUndefined();
    expect(tratarWebhook(corpo({ event: { type: "create_pulse", boardId: 999, pulseId: 1 } }), S, S, cfg).evento).toBeUndefined();
  });
  it("outros tipos de evento e corpos estranhos não geram trabalho", () => {
    expect(tratarWebhook(corpo({ event: { type: "delete_pulse", boardId: 18438464813, pulseId: 1 } }), S, S, cfg).evento).toBeUndefined();
    expect(tratarWebhook(corpo({ event: { type: "create_pulse", boardId: 18438464813, pulseId: "1; drop" } }), S, S, cfg).evento).toBeUndefined();
    expect(tratarWebhook("não é json", S, S, cfg).status).toBe(400);
  });
});

describe("aba Pagamentos oculta", () => {
  it("com a aba oculta a notificação de pagamento abre a tela Hoje ('/'), nunca /pagamentos", () => {
    expect(cfgOculta.abas.pagamentos).toBe(false);
    const [n] = avaliarRegras(criado, pag(), AGORA, cfgOculta);
    expect(n).toMatchObject({ regra: "R3", prioridade: "imediata", titulo: "Aprovação pendente", url: "/" });
    expect(avaliarRegras(criado, ativ({ tipo: "Contrato" }), AGORA, cfgOculta)).toHaveLength(1); // atividades seguem
  });
  it("com a aba visível o link é /pagamentos", () => {
    expect(av(criado, pag())[0].url.startsWith("/pagamentos")).toBe(true);
  });
  it("a config valida abas e pagamentos; a chave multiseguros não existe mais", () => {
    expect(() => validarConfig({ ...raw, abas: { pagamentos: "não", previa_para: [] } })).toThrow(/abas\.pagamentos/);
    expect(() => validarConfig({ ...raw, pagamentos: { aprovacao_diretor_a_partir_de: -1 } })).toThrow(/aprovacao_diretor_a_partir_de/);
    expect("multiseguros" in raw).toBe(false);
  });
});

describe("config e infraestrutura", () => {
  it("notificacoes é validada", () => {
    expect(cfg.notificacoes).toEqual({ janela_inicio: "07:00", janela_fim: "20:00", agrupar_minutos: 15, novo_horas: 24 });
    const com = (o: Record<string, unknown>) => () => validarConfig({ ...raw, notificacoes: { ...raw.notificacoes, ...o } });
    expect(com({ janela_inicio: "7h" })).toThrow(/janela_inicio/);
    expect(com({ janela_fim: "24:00" })).toThrow(/janela_fim/);
    expect(com({ janela_inicio: "21:00" })).toThrow(/antes de janela_fim/);
    expect(com({ agrupar_minutos: 0 })).toThrow(/agrupar_minutos/);
    expect(com({ novo_horas: 1.5 })).toThrow(/novo_horas/);
  });
  it("migração: dedupe único, prioridade restrita, RLS sem nenhuma policy", () => {
    const sql = readFileSync(resolve(RAIZ, "supabase/migrations/20261113000000_notificacoes_fila.sql"), "utf8");
    expect(sql).toMatch(/chave_dedupe\s+text unique not null/);
    expect(sql).toMatch(/check \(prioridade in \('imediata', 'normal'\)\)/);
    expect(sql).toMatch(/enable row level security/);
    expect(sql).not.toMatch(/create policy/i);
  });
  it("a fila usa ON CONFLICT DO NOTHING e o webhook é público só no proxy (protegido pelo token)", () => {
    expect(readFileSync(resolve(RAIZ, "src/lib/notificacoes/servidor.ts"), "utf8")).toMatch(/onConflict: "chave_dedupe", ignoreDuplicates: true/);
    expect(readFileSync(resolve(RAIZ, "src/proxy.ts"), "utf8")).toMatch(/api\/monday\//);
  });
});
