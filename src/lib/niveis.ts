// Níveis de urgência: tipos e ordem. Puro e sem imports, para servir também aos componentes cliente.
export type Nivel = "preto" | "vermelho" | "amarelo" | "verde";

/** Do mais grave ao menos grave. */
export const ORDEM_NIVEL: readonly Nivel[] = ["preto", "vermelho", "amarelo", "verde"];

/** O mais grave entre os níveis (null se não houver nenhum). */
export function piorNivel(niveis: Iterable<Nivel | null | undefined>): Nivel | null {
  let pior: Nivel | null = null;
  for (const n of niveis) {
    if (n && (pior === null || ORDEM_NIVEL.indexOf(n) < ORDEM_NIVEL.indexOf(pior))) pior = n;
  }
  return pior;
}
