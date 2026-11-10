// Transforma a leitura dos quadros (ler.ts) em itens prontos para montar a edição.
// Puro: sem rede. Nunca expõe URLs do monday.
import { parseGrupoMes } from "../calendario";
import { getConfig, gestorDaArea, type JornalConfig, type TipoQuadro } from "../config";
import { parseFrequencia } from "../recorrencia";
import { mesmoRotulo } from "../rotulos";
import { areaDaColuna, ehRegraSemData, type ItemNormalizado, type QuadroLido } from "../coletor/ler";
import { motivoAprovacao } from "./pagamentos";
import type { MotivoSemPrazo } from "../sem-prazo";

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
  /** só pagamentos: por que o diretor aprova ("Acima de R$ 100 mil" | "Área subordinada"); ausente se o item não tem valor */
  motivoAprovacao?: string;
  observacao?: string;
  recorrencia?: string;
  chave?: string;
  etapas?: { total: number; concluidas: number };
  updatedAt: string;
}

/** Item sem nenhuma data (nem nos subitens): nunca some, aparece em semPrazo. */
export type ItemSemPrazo = Omit<ItemJornal, "data" | "dataHerdada"> & {
  data: null;
  /** "sem_prazo": item comum sem data; "regra_sem_data": regra recorrente sem data inicial (não gera cópias) */
  motivo: MotivoSemPrazo;
};

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
  if (mesmoRotulo(s, t.status_concluido)) return "concluido";
  if (t.status_travado && mesmoRotulo(s, t.status_travado)) return "travado";
  if (mesmoRotulo(s, t.status_cancelado)) return "cancelado";
  return "aberto"; // Aguardando aprovação / Não iniciado / Em andamento / sem status
}

function tipoDoItem(it: ItemNormalizado, tipoQuadro: TipoQuadro): TipoItem {
  if (tipoQuadro === "pagamentos") return "Pagamento";
  const rotulo = it.valores["Tipo"]?.label?.trim();
  return TIPOS_ITEM.find((t) => mesmoRotulo(t, rotulo)) ?? "Atividade";
}

/** Dono de um item sem área identificável em quadro por_area. */
export const SEM_AREA = "Sem área";

/**
 * O item entra na edição?
 * por_mes: ocorrências em grupos de mês e avulsos ("Não recorrente") ainda no Cadastro.
 * por_area: ocorrências e únicos dos grupos de área e de finalizadas (regras nunca).
 * lista (Pagamentos): tudo o que ainda não foi para o grupo de finalizados.
 */
function entra(it: ItemNormalizado, cfg: JornalConfig): boolean {
  if (it.lista) return !it.lista.finalizada;
  if (it.porArea) return it.porArea.classe !== "regra" && (it.porArea.areaGrupo !== null || it.porArea.finalizada);
  if (it.noCadastro) return parseFrequencia(it.recorrencia) === "nao_recorrente"; // regras recorrentes já têm ocorrências
  return parseGrupoMes(it.grupo.titulo, cfg) !== null;
}

/**
 * Quem responde. por_area: o gestor da coluna Área; vazia, o da área do grupo; senão "Sem área".
 * Pagamentos: o próprio diretor (aprova os pagamentos; nunca é um gestor e não entra nas contagens deles).
 */
export function donoDoItem(it: ItemNormalizado, q: Pick<QuadroLido, "tipo" | "dono">, cfg: JornalConfig = getConfig()): string {
  if (it.porArea) return gestorDaArea(areaDaColuna(it, cfg), cfg) ?? gestorDaArea(it.porArea.areaGrupo, cfg) ?? SEM_AREA;
  return q.tipo === "pagamentos" ? cfg.diretor : q.dono;
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
      const regraSemData = ehRegraSemData(it); // regras com data nunca entram; sem data, aparecem em "Sem prazo"
      if (!entra(it, cfg) && !regraSemData) continue;
      const valor = it.valores["Valor (R$)"]?.number;
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
        ...(q.tipo === "pagamentos" && typeof valor === "number" ? { motivoAprovacao: motivoAprovacao(valor, cfg) } : {}),
        ...(txt(it.valores[tcfg.campo_motivo]?.text) ? { observacao: txt(it.valores[tcfg.campo_motivo]?.text) } : {}),
        ...(txt(it.recorrencia) ? { recorrencia: txt(it.recorrencia) } : {}),
        ...(txt(it.chave) ? { chave: txt(it.chave) } : {}),
        ...(it.etapas ? { etapas: it.etapas } : {}),
        updatedAt: it.updatedAt,
      };
      const { data, herdada } = dataDoItem(it);
      if (data) itens.push({ ...base, data, ...(herdada ? { dataHerdada: true as const } : {}) });
      else semPrazo.push({ ...base, data: null, motivo: regraSemData ? "regra_sem_data" : "sem_prazo" });
    }
  }
  return { itens, semPrazo };
}
