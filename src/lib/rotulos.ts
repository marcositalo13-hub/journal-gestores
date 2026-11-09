// Rótulos de colunas status/dropdown do monday: normalização e resolução do ID.
// Os usuários renomeiam rótulos (ex.: "Mensal" → "4. Mensal"); comparamos pelo nome normalizado
// e SEMPRE gravamos pelo ID do rótulo, nunca pelo texto.

export interface RotuloColuna {
  id: number;
  nome: string;
}

/** Prefixo numérico de ordenação: "4. ", "4 - ", "4)", "4–", "4: " (o separador é obrigatório). */
const PREFIXO_NUMERICO = /^\s*\d+\s*[.)\-–—:]\s*/;

/** trim, sem prefixo numérico, sem acento, minúsculas, espaços colapsados. */
export function normalizarRotulo(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(PREFIXO_NUMERICO, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Dois rótulos são o mesmo se o nome normalizado coincide (e não é vazio). */
export function mesmoRotulo(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizarRotulo(a);
  return x !== "" && x === normalizarRotulo(b);
}

/** Lê os rótulos de `settings_str` (status: {labels: {"17": "Não iniciado"}}; dropdown: {labels: [{id, name}]}). */
export function parseRotulosDaColuna(tipo: string, settingsStr: string | null | undefined): RotuloColuna[] | undefined {
  if (tipo !== "status" && tipo !== "dropdown") return undefined;
  try {
    const s = JSON.parse(settingsStr || "{}") as { labels?: unknown };
    if (tipo === "status") {
      const labels = (s.labels ?? {}) as Record<string, unknown>;
      return Object.entries(labels)
        .filter(([, nome]) => typeof nome === "string" && nome.trim() !== "")
        .map(([id, nome]) => ({ id: Number(id), nome: nome as string }));
    }
    return ((s.labels ?? []) as { id?: number; name?: string }[])
      .filter((l) => typeof l?.id === "number" && typeof l?.name === "string")
      .map((l) => ({ id: l.id as number, nome: l.name as string }));
  } catch {
    return undefined;
  }
}

/** O rótulo configurado, pelo nome normalizado; null se a coluna não tem um rótulo equivalente. */
export function resolverRotulo(rotulos: RotuloColuna[] | undefined, nome: string): RotuloColuna | null {
  return rotulos?.find((r) => mesmoRotulo(r.nome, nome)) ?? null;
}

export class RotuloNaoResolvido extends Error {
  constructor(
    public readonly coluna: string,
    public readonly rotulo: string,
  ) {
    super(`rótulo "${rotulo}" não existe na coluna "${coluna}" do quadro (foi renomeado ou removido?)`);
    this.name = "RotuloNaoResolvido";
  }
}
