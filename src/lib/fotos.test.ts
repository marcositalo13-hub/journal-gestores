import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { getConfig } from "./config";
import { slugDe } from "./edicao/caderno";
import { BUCKET_FOTOS, caminhoDaFoto, classificarArquivosDeFotos, iniciais, primeiroEUltimo, seloGestor } from "./fotos";

const slugs = getConfig().gestores.map((g) => slugDe(g.nome));
const RAIZ = resolve(__dirname, "../..");

describe("caminhoDaFoto / slugs", () => {
  it("todas as fotos são normalizadas para {slug}.webp", () => {
    expect(caminhoDaFoto("joao-silva")).toBe("joao-silva.webp");
    expect(BUCKET_FOTOS).toBe("gestores");
  });
  it("slug do nome: minúsculo, sem acento, hifens (os do config)", () => {
    expect(slugs).toContain("joao-silva");
    expect(slugs).toContain("solange-mata");
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("classificarArquivosDeFotos", () => {
  it("aceita {slug}.jpg|jpeg|png|webp (qualquer caixa) de gestores existentes", () => {
    const r = classificarArquivosDeFotos(["joao-silva.jpg", "solange-mata.PNG", "keite-martins.webp", "lucas-martins.jpeg"], slugs);
    expect(r.validos.map((v) => [v.arquivo, v.slug])).toEqual([
      ["joao-silva.jpg", "joao-silva"],
      ["solange-mata.PNG", "solange-mata"],
      ["keite-martins.webp", "keite-martins"],
      ["lucas-martins.jpeg", "lucas-martins"],
    ]);
    expect(r.ignorados).toEqual([]);
  });
  it("ignora, com motivo: extensão errada, slug desconhecido (inclusive nome com acento)", () => {
    const r = classificarArquivosDeFotos(["joao-silva.gif", "joão-silva.jpg", "ninguem.jpg", "semextensao"], slugs);
    expect(r.validos).toEqual([]);
    expect(r.ignorados.map((i) => i.arquivo)).toEqual(["joao-silva.gif", "joão-silva.jpg", "ninguem.jpg", "semextensao"]);
    expect(r.ignorados[0].motivo).toMatch(/jpg, .png ou .webp/);
    expect(r.ignorados[2].motivo).toMatch(/nenhum gestor/);
  });
  it("dois arquivos do mesmo gestor: usa o último e avisa do outro", () => {
    const r = classificarArquivosDeFotos(["joao-silva.jpg", "joao-silva.png"], slugs);
    expect(r.validos.map((v) => v.arquivo)).toEqual(["joao-silva.png"]);
    expect(r.ignorados).toEqual([{ arquivo: "joao-silva.jpg", motivo: expect.stringContaining("joao-silva.png") }]);
  });
});

describe("nomes", () => {
  it("primeiroEUltimo", () => {
    expect(primeiroEUltimo("Solange Mata")).toBe("Solange Mata");
    expect(primeiroEUltimo("Maria da Silva Souza")).toBe("Maria Souza");
    expect(primeiroEUltimo("TESTE")).toBe("TESTE");
    expect(primeiroEUltimo("  João   Silva ")).toBe("João Silva");
  });
  it("iniciais", () => {
    expect(iniciais("Solange Mata")).toBe("SM");
    expect(iniciais("Maria da Silva Souza")).toBe("MS");
    expect(iniciais("João Silva")).toBe("JS");
    expect(iniciais("TESTE")).toBe("TE");
    expect(iniciais("ana")).toBe("AN");
    expect(iniciais("")).toBe("?");
  });
});

describe("seloGestor", () => {
  it("pendências = atrasados + travados; rótulo acessível no singular e no plural; cor do pior item", () => {
    expect(seloGestor({ atrasados: 1, travados: 1, semPrazo: 0 }, "preto")).toEqual({ tipo: "pendencias", n: 2, nivel: "preto", rotulo: "2 pendências" });
    expect(seloGestor({ atrasados: 0, travados: 1, semPrazo: 0 }, "vermelho")).toEqual({ tipo: "pendencias", n: 1, nivel: "vermelho", rotulo: "1 pendência" });
  });
  it("sem pendências: ponto na cor do pior item, com rótulo", () => {
    expect(seloGestor({ atrasados: 0, travados: 0, semPrazo: 0 }, "vermelho")).toEqual({ tipo: "atencao", nivel: "vermelho", rotulo: "Itens com prazo hoje" });
    expect(seloGestor({ atrasados: 0, travados: 0, semPrazo: 1 }, "amarelo")).toEqual({ tipo: "atencao", nivel: "amarelo", rotulo: "1 item sem prazo" });
    expect(seloGestor({ atrasados: 0, travados: 0, semPrazo: 3 }, "amarelo")?.rotulo).toBe("3 itens sem prazo");
    expect(seloGestor({ atrasados: 0, travados: 0, semPrazo: 0 }, "amarelo")?.rotulo).toBe("Prazos nos próximos dias");
  });
  it("tudo em dia (nenhum item pior que verde) → sem selo", () => {
    expect(seloGestor({ atrasados: 0, travados: 0, semPrazo: 0 }, null)).toBeNull();
  });
});

describe("fotos nunca vão para arquivos públicos", () => {
  const imagens = (dir: string): string[] =>
    !existsSync(dir) ? [] : readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

  it("public/ não tem fotos de gestores", () => {
    const achadas = imagens(join(RAIZ, "public")).filter((f) => slugs.some((s) => f.toLowerCase().includes(s)));
    expect(achadas).toEqual([]);
  });
  it("a pasta de origem é ignorada pelo git (só o LEIA-ME é versionado)", () => {
    const gitignore = readFileSync(join(RAIZ, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/^\/fotos-gestores\/\*$/m);
    expect(gitignore).toMatch(/^!\/fotos-gestores\/LEIA-ME\.txt$/m);
  });
  it("a migração mantém o bucket privado e só dá SELECT a usuários autenticados", () => {
    const sql = readFileSync(join(RAIZ, "supabase/migrations/20261110000000_bucket_gestores.sql"), "utf8");
    expect(sql).toMatch(/'gestores', 'gestores', false/);
    expect(sql).toMatch(/for select\s+to authenticated/);
    expect(sql).not.toMatch(/for (insert|update|delete|all)/i);
    expect(sql).not.toMatch(/to (anon|public)/i);
  });
  it("a service role nunca é lida pelo código do app (só pelos scripts locais)", () => {
    const procurar = (dir: string): string[] =>
      readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f)).map((f) => join(dir, f));
    // única exceção: supabase/servico.ts (só servidor), usado pelo envio de push e pela fila de notificações
    const vazando = procurar(join(RAIZ, "src"))
      .filter((f) => !f.split(sep).join("/").endsWith("src/lib/supabase/servico.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("SERVICE_ROLE"));
    expect(vazando).toEqual([]);
    expect(readFileSync(join(RAIZ, ".env.local.example"), "utf8")).toMatch(/Nunca em variáveis NEXT_PUBLIC/);
  });
});
