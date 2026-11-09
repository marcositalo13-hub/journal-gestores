// ?item=ID (aberto por uma notificação): acha o item na leitura em cache ou, se for novo demais para o cache,
// relê só ele no monday. Só servidor.
import { buscarItemEdicao } from "../notificacoes/monday-item";
import type { ItemEdicao } from "./itens";
import { obterItens } from "./obter";

export async function itemDaUrl(param: string | string[] | undefined): Promise<ItemEdicao | null> {
  const id = typeof param === "string" && /^\d{1,20}$/.test(param) ? param : null;
  if (!id) return null;
  try {
    const d = await obterItens();
    const achado = [...d.itens, ...d.semPrazo].find((i) => i.id === id);
    return achado ?? (await buscarItemEdicao(id));
  } catch (e) {
    console.error(`[item] ${id} indisponível:`, e instanceof Error ? e.message : "erro desconhecido");
    return null;
  }
}
