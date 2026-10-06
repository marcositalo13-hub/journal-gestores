// Transforma a leitura dos quadros (ler.ts) em itens prontos para montar a edição.
// Puro: sem rede. Nunca expõe URLs do monday.
import { parseGrupoMes } from "../calendario";
import { getConfig, gestorDaCoordenacao, type JornalConfig, type TipoQuadro } from "../config";
import { parseFrequencia } from "../recorrencia";
import type { ItemNormalizado, QuadroLido } from "../coletor/ler";

export type TipoItem = "Atividade" | "Entrega" | "Contrato" | "Pagamento";
export type Categoria = "aberto" | "concluido" | "travado" | "cancelado";

export interface ItemJornal {
  id: string;
  nome: string;
  quadroId: string;
  tipoQuadro: TipoQuadro;
  dono: string;
  tipo: TipoItem;
  /** YYYY-MM-DD, como está no monday (ou herdada dos subitens: veja dataHerdada) */
  data: string;
  /** true quando o item pai estava sem data e usamos a mais recente entre os subitens */
  dataHerdada?: true;
  /** rótulo cru do status */
  status: string | null;
  categoria: Categoria;
  valor?: number;
  favorecido?: string;
  coordenacao?: string;
  responsavel?: string;
  observacao?: string;
  recorrencia?: string;
  chave?: string;
  etapas?: { total: number; concluidas: number };
  updatedAt: string;
}

/** Item sem nenhuma data (nem nos subitens): nunca some, aparece em semPrazo. */
export type ItemSemPrazo = Omit<ItemJornal, "data" | "dataHerdada"> & { data: null };

/** Qualquer item que pode aparecer na edição. */
export type ItemEdicao = ItemJornal | ItemSemPrazo;

export interface ItensJornal {
  itens: ItemJornal[];
  semPrazo: ItemSemPrazo[];
}

const TIPOS_ITEM: TipoItem[] = ["Atividade", "Entrega", "Contrato", "Pagamento"];

export function categoriaDoStatus(status: string | null, tipo: TipoQuadro, cfg: JornalConfig = getConfig()): Categoria {
  const t = cfg.tipos_de_quadro[tipo];
  const s = (status ?? "").trim();
  if (s === t.status_concluido) return "concluido";
  if (s === t.status_travado) return "travado";
  if (s === t.status_cancelado) return "cancelado";
  return "aberto"; // Previsto / Não iniciado / Em andamento / sem status
}

function tipoDoItem(it: ItemNormalizado, tipoQuadro: TipoQuadro): TipoItem {
  if (tipoQuadro === "pagamentos") return "Pagamento";
  const rotulo = it.valores["Tipo"]?.label?.trim();
  return TIPOS_ITEM.find((t) => t === rotulo) ?? "Atividade";
}

/** O item entra na edição? Ocorrências em grupos de mês e avulsos ("Não recorrente") ainda no Cadastro. */
function entra(it: ItemNormalizado, cfg: JornalConfig): boolean {
  if (it.noCadastro) return parseFrequencia(it.recorrencia) === "nao_recorrente"; // regras recorrentes já têm ocorrências
  return parseGrupoMes(it.grupo.titulo, cfg) !== null;
}

/** Rótulos da coluna Coordenação (dropdown), com fallback para o texto. */
export function rotulosDaCoordenacao(v: { labels: string[] | null; text: string } | null | undefined): string[] {
  if (!v) return [];
  return v.labels?.length ? v.labels : v.text ? v.text.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

/** Quem responde: nos Pagamentos, o gestor da coordenação; sem coordenação (ou desconhecida), o dono do quadro. */
export function donoDoItem(it: ItemNormalizado, q: Pick<QuadroLido, "tipo" | "dono">, cfg: JornalConfig = getConfig()): string {
  if (q.tipo !== "pagamentos") return q.dono;
  return gestorDaCoordenacao(rotulosDaCoordenacao(it.valores["Coordenação"]), cfg) ?? q.dono;
}

const txt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);

/** Data do item; se estiver vazia, a mais recente entre os subitens não cancelados. */
function dataDoItem(it: ItemNormalizado): { data: string | null; herdada: boolean } {
  if (it.data) return { data: it.data, herdada: false };
  const ultima = [...it.datasSubitens].sort().at(-1);
  return ultima ? { data: ultima, herdada: true } : { data: null, herdada: false };
}

export function montarItensJornal(quadros: QuadroLido[], cfg: JornalConfig = getConfig()): ItensJornal {
  const itens: ItemJornal[] = [];
  const semPrazo: ItemSemPrazo[] = [];
  for (const q of quadros) {
    const tcfg = cfg.tipos_de_quadro[q.tipo];
    for (const it of q.itens) {
      if (!entra(it, cfg)) continue;
      const valor = it.valores["Valor (R$)"]?.number;
      const coordenacao = it.valores["Coordenação"]?.labels?.join(", ") || it.valores["Coordenação"]?.text;
      const base = {
        id: it.id,
        nome: it.nome,
        quadroId: q.id,
        tipoQuadro: q.tipo,
        dono: donoDoItem(it, q, cfg),
        tipo: tipoDoItem(it, q.tipo),
        status: it.status,
        categoria: categoriaDoStatus(it.status, q.tipo, cfg),
        ...(typeof valor === "number" ? { valor } : {}),
        ...(txt(it.valores["Favorecido"]?.text) ? { favorecido: txt(it.valores["Favorecido"]?.text) } : {}),
        ...(txt(coordenacao) ? { coordenacao: txt(coordenacao) } : {}),
        ...(txt(it.valores["Responsável"]?.text) ? { responsavel: txt(it.valores["Responsável"]?.text) } : {}),
        ...(txt(it.valores[tcfg.campo_motivo]?.text) ? { observacao: txt(it.valores[tcfg.campo_motivo]?.text) } : {}),
        ...(txt(it.recorrencia) ? { recorrencia: txt(it.recorrencia) } : {}),
        ...(txt(it.chave) ? { chave: txt(it.chave) } : {}),
        ...(it.etapas ? { etapas: it.etapas } : {}),
        updatedAt: it.updatedAt,
      };
      const { data, herdada } = dataDoItem(it);
      if (data) itens.push({ ...base, data, ...(herdada ? { dataHerdada: true as const } : {}) });
      else semPrazo.push({ ...base, data: null });
    }
  }
  return { itens, semPrazo };
}
