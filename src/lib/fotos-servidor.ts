// URLs assinadas das fotos, geradas NO SERVIDOR com a sessão do leitor (chave publicável + JWT do usuário).
// A service role nunca é usada aqui. Sem foto, sem sessão ou sem a policy do bucket → null (o app mostra iniciais).
import { slugDe } from "./edicao/caderno";
import { BUCKET_FOTOS, caminhoDaFoto } from "./fotos";
import { criarClienteServidor } from "./supabase/server";

/** Validade curta: a URL só precisa durar o tempo de a página carregar as imagens. */
const VALIDADE_SEGUNDOS = 60 * 60;

export async function urlsDasFotos(nomes: string[]): Promise<Record<string, string | null>> {
  const mapa: Record<string, string | null> = Object.fromEntries(nomes.map((n) => [n, null]));
  if (nomes.length === 0) return mapa;
  try {
    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.storage.from(BUCKET_FOTOS).createSignedUrls(
      nomes.map((n) => caminhoDaFoto(slugDe(n))),
      VALIDADE_SEGUNDOS,
    );
    if (error || !data) return mapa;
    data.forEach((d, i) => {
      if (d.signedUrl && !d.error) mapa[nomes[i]] = d.signedUrl;
    });
  } catch (e) {
    console.error("[fotos] URLs assinadas indisponíveis:", e instanceof Error ? e.message : "erro desconhecido");
  }
  return mapa;
}
