// Fotos dos gestores: nomes de arquivo, iniciais e selo de pendências. Puro (sem rede, sem config).
// As fotos ficam num bucket PRIVADO do Supabase; nunca em public/ nem em /_next/static.

export const BUCKET_FOTOS = "gestores";
export const TAMANHO_FOTO = 512;
export const EXTENSOES_FOTO = [".jpg", ".jpeg", ".png", ".webp"];

/** Caminho do objeto no bucket: todas as fotos são normalizadas para WebP. */
export function caminhoDaFoto(slug: string): string {
  return `${slug}.webp`;
}

/** Separa os arquivos de ./fotos-gestores em válidos ({slug}.jpg|png|webp de um gestor) e ignorados (com o motivo). */
export function classificarArquivosDeFotos(arquivos: string[], slugsValidos: string[]) {
  const validos: { arquivo: string; slug: string }[] = [];
  const ignorados: { arquivo: string; motivo: string }[] = [];
  for (const arquivo of arquivos) {
    const ponto = arquivo.lastIndexOf(".");
    const ext = ponto >= 0 ? arquivo.slice(ponto).toLowerCase() : "";
    const slug = (ponto >= 0 ? arquivo.slice(0, ponto) : arquivo).toLowerCase();
    if (!EXTENSOES_FOTO.includes(ext)) ignorados.push({ arquivo, motivo: "não é .jpg, .png ou .webp" });
    else if (!slugsValidos.includes(slug)) ignorados.push({ arquivo, motivo: `"${slug}" não é o slug de nenhum gestor` });
    else validos.push({ arquivo, slug });
  }
  // dois arquivos para o mesmo gestor (joao-silva.jpg e joao-silva.png): fica o último em ordem alfabética, com aviso
  const vistos = new Map<string, string>();
  for (const v of validos) vistos.set(v.slug, v.arquivo);
  const unicos = validos.filter((v) => vistos.get(v.slug) === v.arquivo);
  for (const v of validos) if (!unicos.includes(v)) ignorados.push({ arquivo: v.arquivo, motivo: `há outro arquivo para "${v.slug}"; usei ${vistos.get(v.slug)}` });
  return { validos: unicos, ignorados };
}

/** Primeiro e último nome: "Maria da Silva Souza" → "Maria Souza". */
export function primeiroEUltimo(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return p.length <= 2 ? p.join(" ") : `${p[0]} ${p[p.length - 1]}`;
}

/** Iniciais: "Solange Mata" → "SM"; uma palavra só ("TESTE") → "TE". */
export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  const letras = p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0];
  return letras.toLocaleUpperCase("pt-BR");
}

export type SeloGestor = { tipo: "pendencias"; n: number; rotulo: string } | { tipo: "sem-prazo"; n: number; rotulo: string };

/**
 * Selo sobre a foto: círculo de alerta com (atrasados + travados) quando > 0;
 * senão, um ponto de aviso quando só há itens sem prazo; senão nada (em dia).
 */
export function seloGestor(c: { atrasados: number; travados: number; semPrazo: number }): SeloGestor | null {
  const p = c.atrasados + c.travados;
  if (p > 0) return { tipo: "pendencias", n: p, rotulo: p === 1 ? "1 pendência" : `${p} pendências` };
  if (c.semPrazo > 0) return { tipo: "sem-prazo", n: c.semPrazo, rotulo: c.semPrazo === 1 ? "1 item sem prazo" : `${c.semPrazo} itens sem prazo` };
  return null;
}
