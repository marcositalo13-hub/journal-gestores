import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getConfig, validarConfig, type JornalConfig } from "./config";
import { formatarWhatsapp, normalizarWhatsapp } from "./contatos";
import { lerContatos, salvarContato, type ClienteContatos } from "./contatos-servidor";

describe("normalizarWhatsapp", () => {
  it("aceita as formas comuns e devolve só dígitos com 55", () => {
    expect(normalizarWhatsapp("(61) 99999-9999")).toBe("5561999999999");
    expect(normalizarWhatsapp("61999999999")).toBe("5561999999999");
    expect(normalizarWhatsapp("5561999999999")).toBe("5561999999999");
    expect(normalizarWhatsapp("+55 (61) 9 9999-9999")).toBe("5561999999999");
    expect(normalizarWhatsapp("(61) 3333-4444")).toBe("556133334444"); // fixo: 10 dígitos
  });
  it("rejeita o que não tem 12–13 dígitos depois do 55", () => {
    expect(normalizarWhatsapp("999")).toBeNull();
    expect(normalizarWhatsapp("")).toBeNull();
    expect(normalizarWhatsapp("abc")).toBeNull();
    expect(normalizarWhatsapp("55619999999999")).toBeNull(); // 14 dígitos
    expect(normalizarWhatsapp("619999999")).toBeNull(); // 9 dígitos
  });
  it("formatarWhatsapp para editar", () => {
    expect(formatarWhatsapp("5561999999999")).toBe("(61) 99999-9999");
    expect(formatarWhatsapp("556133334444")).toBe("(61) 3333-4444");
  });
});

const cfg = getConfig();
const comNumero: JornalConfig = { ...cfg, gestores: cfg.gestores.map((g) => (g.nome === "João Silva" ? { ...g, whatsapp: "5561911112222" } : g)) };

function falso(resposta: { data?: { gestor_slug: string; whatsapp: string }[] | null; error?: { code?: string; message: string } | null }, upsert = vi.fn(async () => ({ error: null }))) {
  const cliente: ClienteContatos = {
    from: () => ({ select: async () => ({ data: resposta.data ?? null, error: resposta.error ?? null }), upsert }),
  };
  return { cliente, upsert };
}

describe("lerContatos", () => {
  it("o valor do banco vence o do config", async () => {
    const { cliente } = falso({ data: [{ gestor_slug: "joao-silva", whatsapp: "5561999999999" }, { gestor_slug: "keite-martins", whatsapp: "5561988887777" }] });
    const m = await lerContatos(cliente, comNumero);
    expect(m["joao-silva"]).toBe("5561999999999");
    expect(m["keite-martins"]).toBe("5561988887777");
  });
  it("sem linhas no banco, vale o config", async () => {
    expect((await lerContatos(falso({ data: [] }).cliente, comNumero))["joao-silva"]).toBe("5561911112222");
  });
  it("tabela inexistente: cai no config, não quebra e avisa uma vez só", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { cliente } = falso({ error: { code: "PGRST205", message: "Could not find the table 'public.contatos_gestores' in the schema cache" } });
    expect((await lerContatos(cliente, comNumero))["joao-silva"]).toBe("5561911112222");
    await lerContatos(cliente, comNumero);
    await lerContatos(falso({ error: { code: "42P01", message: 'relation "contatos_gestores" does not exist' } }).cliente, comNumero);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
  it("exceção na consulta também cai no config", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cliente: ClienteContatos = {
      from: () => {
        throw new Error("rede");
      },
    };
    expect((await lerContatos(cliente, comNumero))["joao-silva"]).toBe("5561911112222");
    log.mockRestore();
  });
});

describe("salvarContato", () => {
  const leitor = cfg.leitores[0];
  it("rejeita quem não é leitor (sem gravar nada)", async () => {
    const { cliente, upsert } = falso({});
    expect(await salvarContato(null, cliente, "joao-silva", "(61) 99999-9999")).toEqual({ ok: false, erro: "nao_autorizado" });
    expect(upsert).not.toHaveBeenCalled();
  });
  it("rejeita número inválido e gestor desconhecido", async () => {
    const { cliente, upsert } = falso({});
    expect(await salvarContato(leitor, cliente, "joao-silva", "999")).toEqual({ ok: false, erro: "invalido" });
    expect(await salvarContato(leitor, cliente, "fulano", "(61) 99999-9999")).toEqual({ ok: false, erro: "gestor_desconhecido" });
    expect(upsert).not.toHaveBeenCalled();
  });
  it("normaliza e grava com o e-mail do leitor", async () => {
    const { cliente, upsert } = falso({});
    expect(await salvarContato(leitor, cliente, "joao-silva", "(61) 99999-9999")).toEqual({ ok: true, numero: "5561999999999" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ gestor_slug: "joao-silva", whatsapp: "5561999999999", atualizado_por: leitor.email }));
  });
  it("falha do banco vira erro controlado", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { cliente } = falso({}, vi.fn(async () => ({ error: { message: "boom" } as { message: string } | null })) as never);
    expect(await salvarContato(leitor, cliente, "joao-silva", "(61) 99999-9999")).toEqual({ ok: false, erro: "falha" });
    log.mockRestore();
  });
});

describe("config e migração", () => {
  it("os números no config continuam validados", () => {
    expect(() => validarConfig({ ...cfg, gestores: cfg.gestores.map((g, i) => (i === 0 ? { ...g, whatsapp: "123" } : g)) })).toThrow(/whatsapp/);
  });
  it("a migração tem RLS, select/insert/update para authenticated, check 12–13 dígitos e nenhuma policy de delete nem de anon", () => {
    const sql = readFileSync(resolve(__dirname, "../../supabase/migrations/20261111000000_contatos_gestores.sql"), "utf8");
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/\^\[0-9\]\{12,13\}\$/);
    for (const op of ["select", "insert", "update"]) expect(sql).toMatch(new RegExp(`for ${op} to authenticated`));
    expect(sql).not.toMatch(/for delete/i);
    expect(sql).not.toMatch(/to (anon|public)/i);
  });
  it("a service role nunca aparece nos arquivos de contatos", () => {
    for (const f of ["src/lib/contatos-servidor.ts", "src/app/(app)/contatos.ts", "src/components/pauta/contato-whatsapp.tsx"]) {
      expect(readFileSync(resolve(__dirname, "../..", f), "utf8")).not.toMatch(/SERVICE_ROLE/);
    }
  });
});
