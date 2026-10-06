// Transforma a leitura dos quadros (ler.ts) em itens prontos para montar a edição.
// Puro: sem rede. Nunca expõe URLs do monday.
import { parseGrupoMes } from "../calendario";
import { getConfig, type JornalConfig, type TipoQuadro } from "../config";
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
  /** YYYY-MM-DD, como está no monday */
  data: string;
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
  if (!it.data) return false;
  if (it.noCadastro) return parseFrequencia(it.recorrencia) === "nao_recorrente"; // regras recorrentes já têm ocorrências
  return parseGrupoMes(it.grupo.titulo, cfg) !== null;
}

const txt = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);

export function montarItensJornal(quadros: QuadroLido[], cfg: JornalConfig = getConfig()): ItemJornal[] {
  const out: ItemJornal[] = [];
  for (const q of quadros) {
    const tcfg = cfg.tipos_de_quadro[q.tipo];
    for (const it of q.itens) {
      if (!entra(it, cfg)) continue;
      const valor = it.valores["Valor (R$)"]?.number;
      const coordenacao = it.valores["Coordenação"]?.labels?.join(", ") || it.valores["Coordenação"]?.text;
      out.push({
        id: it.id,
        nome: it.nome,
        quadroId: q.id,
        tipoQuadro: q.tipo,
        dono: q.dono,
        tipo: tipoDoItem(it, q.tipo),
        data: it.data!,
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
      });
    }
  }
  return out;
}
