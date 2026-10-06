// O JavaScript do browser (/_next/static) é público. Nenhum arquivo "use client" pode alcançar o
// config.json (e-mails dos leitores, WhatsApp dos gestores) pelos imports.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");
const PROIBIDOS = ["lib/config", "lib/calendario", "lib/edicao/obter", "lib/monday/client", "lib/supabase/server"];

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

function resolverImport(de: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(de), spec) : null;
  if (!base) return null; // pacote npm
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** imports que entram no bundle (ignora `import type`; ignora "use server": vira chamada remota). */
function importsDeValor(arquivo: string): string[] {
  const codigo = readFileSync(arquivo, "utf8");
  if (/^\s*["']use server["']/.test(codigo)) return [];
  const out: string[] = [];
  for (const m of codigo.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) {
    const r = resolverImport(arquivo, m[1]);
    if (r) out.push(r);
  }
  return out;
}

function alcance(inicio: string): Set<string> {
  const vistos = new Set<string>();
  const fila = [inicio];
  while (fila.length) {
    const a = fila.pop()!;
    if (vistos.has(a)) continue;
    vistos.add(a);
    fila.push(...importsDeValor(a));
  }
  return vistos;
}

const clientes = arquivos(SRC).filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

describe("bundle do browser", () => {
  it("encontra os componentes cliente", () => expect(clientes.length).toBeGreaterThan(5));

  it("o rastreador de imports funciona (a folha de detalhes alcança formato e datas, e um módulo com config é detectado)", () => {
    const detalhe = [...alcance(join(SRC, "components/pauta/detalhe.tsx"))].map((f) => f.replace(/\\/g, "/"));
    expect(detalhe.some((f) => f.endsWith("lib/formato.ts"))).toBe(true);
    expect(detalhe.some((f) => f.endsWith("lib/datas.ts"))).toBe(true);
    const doServidor = [...alcance(join(SRC, "lib/calendario.ts"))].map((f) => f.replace(/\\/g, "/"));
    expect(doServidor.some((f) => f.endsWith("lib/config.ts"))).toBe(true);
  });

  for (const arq of clientes) {
    const nome = arq.slice(SRC.length + 1).replace(/\\/g, "/");
    it(`${nome} não alcança config/calendário/servidor`, () => {
      const alcancados = [...alcance(arq)].map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/").replace(/\.(ts|tsx)$/, ""));
      const proibidos = alcancados.filter((f) => PROIBIDOS.some((p) => f === p || f.startsWith(`${p}/`)));
      expect(proibidos).toEqual([]);
    });
  }
});
