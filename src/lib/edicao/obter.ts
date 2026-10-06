// Busca dados ao vivo do monday e entrega a edição. Sem fallback: se o monday falhar, lança.
import { unstable_cache } from "next/cache";
import { hoje } from "../calendario";
import { lerQuadros } from "../coletor/ler";
import { getConfig } from "../config";
import { montarItensJornal, type ItemJornal } from "./itens";
import { montarEdicao, type Edicao } from "./montar";

export class EdicaoIndisponivelError extends Error {
  constructor(motivo: string) {
    super(`Edição indisponível: ${motivo}`);
    this.name = "EdicaoIndisponivelError";
  }
}

export interface DadosLidos {
  itens: ItemJornal[];
  /** instante da leitura no monday (ISO) */
  geradoEm: string;
}

/** Leitura sem cache (usada também por scripts fora do Next). */
export async function buscarItens(): Promise<DadosLidos> {
  let quadros;
  try {
    quadros = await lerQuadros();
  } catch (e) {
    throw new EdicaoIndisponivelError(`falha ao ler o monday (${e instanceof Error ? e.message : "erro desconhecido"})`);
  }
  const ausente = quadros.find((q) => q.avisos.some((a) => a.codigo === "quadro_nao_encontrado"));
  if (ausente) throw new EdicaoIndisponivelError(`quadro ${ausente.id} não encontrado ou sem acesso no monday`);
  return { itens: montarItensJornal(quadros), geradoEm: new Date().toISOString() };
}

// Cache de 300 s só da leitura; a edição é montada a cada chamada com a data de hoje,
// assim ela não "vira" com atraso na virada do dia. (unstable_cache: não exige cacheComponents.)
const lerComCache = unstable_cache(buscarItens, ["edicao-itens-v1"], { revalidate: 300, tags: ["edicao"] });

export async function obterEdicao(agora: Date = new Date()): Promise<Edicao> {
  const { itens, geradoEm } = await lerComCache();
  return montarEdicao(itens, hoje(agora), getConfig(), geradoEm);
}
