import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getConfig } from "../config";
import { chaveParaBytes, estadoNotificacoes } from "./estado";
import { salvarInscricaoCom, type ClienteInscricoes } from "./inscricao";
import { enviarParaEmail, type DepsEnvio, type Inscricao } from "./nucleo";
import { montarPayload, NOTIFICACAO_TESTE, temValor } from "./payload";
import { tratarTeste } from "./teste";

const RAIZ = resolve(__dirname, "../../..");

describe("payload: nunca há valores", () => {
  it("monta title/body/tag/url", () => {
    expect(JSON.parse(montarPayload({ titulo: "A Pauta", corpo: "Contrato com prazo amanhã", tag: "contrato-1", url: "/gestores/joao-silva" }))).toEqual({
      title: "A Pauta",
      body: "Contrato com prazo amanhã",
      tag: "contrato-1",
      url: "/gestores/joao-silva",
    });
    expect(JSON.parse(montarPayload(NOTIFICACAO_TESTE))).toMatchObject({ title: "A Pauta", body: "Notificações ativadas. Você receberá avisos importantes por aqui.", url: "/" });
  });
  it("recusa texto com valor monetário, em qualquer formato", () => {
    for (const t of ["Pagamento de R$ 80.000,00", "R$10", "total 1.234,56", "vence 99,90"]) {
      expect(temValor(t)).toBe(true);
      expect(() => montarPayload({ titulo: "A Pauta", corpo: t, tag: "x" })).toThrow(/valores/);
      expect(() => montarPayload({ titulo: t, corpo: "ok", tag: "x" })).toThrow(/valores/);
    }
  });
  it("datas e contagens não são valores", () => {
    expect(temValor("Prazo 17/10 e 3 itens atrasados")).toBe(false);
  });
  it("exige tag e URL interna", () => {
    expect(() => montarPayload({ titulo: "a", corpo: "b", tag: " " })).toThrow(/tag/);
    expect(() => montarPayload({ titulo: "a", corpo: "b", tag: "t", url: "https://outro.site" })).toThrow(/interno/);
    expect(() => montarPayload({ titulo: "a", corpo: "b", tag: "t", url: "//outro.site" })).toThrow(/interno/);
  });
});

const insc = (id: string): Inscricao => ({ id, endpoint: `https://push.example/${id}`, p256dh: "k", auth: "a" });
function deps(erros: Record<string, unknown> = {}, lista = [insc("1"), insc("2")]) {
  const d = {
    listar: vi.fn(async () => lista),
    enviar: vi.fn(async (i: Inscricao) => {
      if (i.id in erros) throw erros[i.id];
    }),
    desativar: vi.fn(async () => undefined),
    marcarEnvio: vi.fn(async () => undefined),
  } satisfies DepsEnvio;
  return d;
}

describe("enviarParaEmail", () => {
  it("envia a todas as inscrições ativas e marca o envio", async () => {
    const d = deps();
    expect(await enviarParaEmail("a@b.com", "{}", d)).toEqual({ enviados: 2, desativadas: 0, falhas: 0 });
    expect(d.marcarEnvio).toHaveBeenCalledTimes(2);
  });
  it("410 e 404 desativam a inscrição; as outras continuam", async () => {
    const d = deps({ "1": Object.assign(new Error("Gone"), { statusCode: 410 }), "2": Object.assign(new Error("Not found"), { statusCode: 404 }) });
    expect(await enviarParaEmail("a@b.com", "{}", d)).toEqual({ enviados: 0, desativadas: 2, falhas: 0 });
    expect(d.desativar).toHaveBeenCalledWith("1");
    expect(d.desativar).toHaveBeenCalledWith("2");
    expect(d.marcarEnvio).not.toHaveBeenCalled();
  });
  it("outras falhas (500, rede) não desativam", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ "1": Object.assign(new Error("boom"), { statusCode: 500 }) });
    expect(await enviarParaEmail("a@b.com", "{}", d)).toEqual({ enviados: 1, desativadas: 0, falhas: 1 });
    expect(d.desativar).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it("sem inscrições: nada a fazer", async () => {
    expect(await enviarParaEmail("a@b.com", "{}", deps({}, []))).toEqual({ enviados: 0, desativadas: 0, falhas: 0 });
  });
});

describe("POST /api/notificacoes/teste (tratarTeste)", () => {
  const leitor = getConfig().leitores[0];
  it("rejeita anônimo com 401 e não envia nada", async () => {
    const enviar = vi.fn();
    expect(await tratarTeste(null, enviar)).toEqual({ status: 401, corpo: { erro: "não autorizado" } });
    expect(enviar).not.toHaveBeenCalled();
  });
  it("leitor: envia o texto de teste só aos aparelhos DELE", async () => {
    const enviar = vi.fn(async () => ({ enviados: 1, desativadas: 0, falhas: 0 }));
    const r = await tratarTeste(leitor, enviar);
    expect(r).toEqual({ status: 200, corpo: { enviados: 1, desativadas: 0, falhas: 0 } });
    expect(enviar).toHaveBeenCalledWith(leitor.email, expect.stringContaining("Notificações ativadas. Você receberá avisos importantes por aqui."));
  });
  it("falha do envio vira 502 sem vazar detalhes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await tratarTeste(leitor, async () => {
      throw new Error("chave secreta inválida");
    });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.corpo)).not.toMatch(/secreta/);
    log.mockRestore();
  });
  it("a rota verifica a sessão e usa tratarTeste", () => {
    const f = readFileSync(resolve(RAIZ, "src/app/api/notificacoes/teste/route.ts"), "utf8");
    expect(f).toMatch(/leitorDaSessao/);
    expect(f).toMatch(/tratarTeste/);
  });
});

describe("salvarInscricaoCom", () => {
  const leitor = getConfig().leitores[0];
  const dados = { endpoint: "https://web.push.apple.com/abc", p256dh: "chave", auth: "segredo" };
  function falso(insere: ({ code?: string; message: string } | null)[]) {
    const insert = vi.fn(async () => ({ error: insere.shift() ?? null }));
    const eq = vi.fn(async () => ({ error: null }));
    const cliente: ClienteInscricoes = { from: () => ({ insert, delete: () => ({ eq }) }) };
    return { cliente, insert, eq };
  }
  it("rejeita quem não é leitor e dados inválidos", async () => {
    const { cliente, insert } = falso([]);
    expect(await salvarInscricaoCom(null, cliente, dados, null)).toEqual({ ok: false, erro: "nao_autorizado" });
    expect(await salvarInscricaoCom(leitor, cliente, { ...dados, endpoint: "http://inseguro" }, null)).toEqual({ ok: false, erro: "invalido" });
    expect(await salvarInscricaoCom(leitor, cliente, { ...dados, auth: "" }, null)).toEqual({ ok: false, erro: "invalido" });
    expect(insert).not.toHaveBeenCalled();
  });
  it("grava com o e-mail do leitor", async () => {
    const { cliente, insert } = falso([]);
    expect(await salvarInscricaoCom(leitor, cliente, dados, "iPhone")).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ email: leitor.email, endpoint: dados.endpoint, ativo: true, user_agent: "iPhone" }));
  });
  it("aparelho já inscrito (23505): troca a linha e grava de novo", async () => {
    const { cliente, insert, eq } = falso([{ code: "23505", message: "duplicate" }]);
    expect(await salvarInscricaoCom(leitor, cliente, dados, null)).toEqual({ ok: true });
    expect(eq).toHaveBeenCalledWith("endpoint", dados.endpoint);
    expect(insert).toHaveBeenCalledTimes(2);
  });
});

describe("estado do cartão", () => {
  const base = { ios: true, standalone: true, suportado: true, chaveOk: true, permissao: "default" as const };
  it("iPhone fora da Tela de Início → instalar", () => {
    expect(estadoNotificacoes({ ...base, standalone: false, suportado: false })).toBe("instalar");
  });
  it("instalado: default → ativar; granted → ativo; denied → negado", () => {
    expect(estadoNotificacoes(base)).toBe("ativar");
    expect(estadoNotificacoes({ ...base, permissao: "granted" })).toBe("ativo");
    expect(estadoNotificacoes({ ...base, permissao: "denied" })).toBe("negado");
  });
  it("sem suporte ou sem chave → indisponível (o cartão some)", () => {
    expect(estadoNotificacoes({ ...base, suportado: false })).toBe("indisponivel");
    expect(estadoNotificacoes({ ...base, chaveOk: false })).toBe("indisponivel");
  });
  it("chave VAPID base64url vira bytes", () => {
    expect(Array.from(chaveParaBytes("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(chaveParaBytes("-_8"))).toEqual([251, 255]);
  });
});

describe("infraestrutura", () => {
  it("a migração: RLS, só as próprias linhas (insert/select/delete), sem update nem anon", () => {
    const sql = readFileSync(resolve(RAIZ, "supabase/migrations/20261112000000_push_inscricoes.sql"), "utf8");
    expect(sql).toMatch(/enable row level security/);
    for (const op of ["select", "insert", "delete"]) expect(sql).toMatch(new RegExp(`for ${op} to authenticated`));
    expect(sql).toMatch(/auth\.jwt\(\) ->> 'email'/);
    expect(sql).not.toMatch(/for (update|all)/i);
    expect(sql).not.toMatch(/to (anon|public)/i);
  });
  it("o service worker mostra a notificação com tag e trata o clique", () => {
    const sw = readFileSync(resolve(RAIZ, "public/sw.js"), "utf8");
    expect(sw).toMatch(/addEventListener\("push"/);
    expect(sw).toMatch(/addEventListener\("notificationclick"/);
    expect(sw).toMatch(/tag:/);
    expect(sw).toMatch(/\/apple-icon/);
  });
  it("só enviar.ts lê a service role entre os arquivos de push, e é só de servidor", () => {
    const f = readFileSync(resolve(RAIZ, "src/lib/push/enviar.ts"), "utf8");
    expect(f).toMatch(/^import "server-only"/m);
    expect(f).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(readFileSync(resolve(RAIZ, "src/lib/push/inscricao.ts"), "utf8")).not.toMatch(/SERVICE_ROLE/);
  });
});
