// "Caderno" de um gestor: os itens dele (ou dele + equipe via reporta_a), organizados por seção.
// Puro: tudo entra por argumento.
import { diasEntre, ehDiaUtil, somarDias, type DataISO } from "../calendario";
import type { JornalConfig } from "../config";
import type { ItemEdicao, ItemJornal, ItemSemPrazo } from "./itens";
import { descendentes, type ItemPendencia, type ItemTravado } from "./montar";

export interface GrupoDia {
  data: DataISO;
  ehDiaUtil: boolean;
  itens: ItemJornal[];
}

export interface Caderno {
  gestor: { nome: string; area: string | null; reportaA: string | null };
  /** tem alguém abaixo na hierarquia (habilita "Com equipe") */
  temEquipe: boolean;
  incluiEquipe: boolean;
  atrasados: ItemPendencia[];
  travados: ItemTravado[];
  hoje: ItemJornal[];
  /** só os dias com itens em aberto, de hoje+1 a hoje+14 */
  proximos14: GrupoDia[];
  semPrazo: ItemSemPrazo[];
  /** itens com data no mês corrente até hoje (sem cancelados) */
  mes: { concluidos: number; total: number };
}

/** "Solange Mata" → "solange-mata"; "João Silva" → "joao-silva". */
export function slugDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Hierarquia do config em pré-ordem (na ordem do arquivo), com o nível de recuo. Raízes: quem reporta a alguém fora da lista. */
export function hierarquia(cfg: JornalConfig): { nome: string; nivel: number }[] {
  const nomes = new Set(cfg.gestores.map((g) => g.nome));
  const out: { nome: string; nivel: number }[] = [];
  const vistos = new Set<string>();
  const visitar = (nome: string, nivel: number) => {
    if (vistos.has(nome)) return;
    vistos.add(nome);
    out.push({ nome, nivel });
    for (const g of cfg.gestores) if (g.reporta_a === nome) visitar(g.nome, nivel + 1);
  };
  for (const g of cfg.gestores) if (!nomes.has(g.reporta_a)) visitar(g.nome, 0);
  for (const g of cfg.gestores) visitar(g.nome, 0); // ciclos: ninguém some
  return out;
}

const emAberto = (i: ItemEdicao) => i.categoria === "aberto" || i.categoria === "travado";
const porNome = (a: ItemEdicao, b: ItemEdicao) => a.nome.localeCompare(b.nome, "pt-BR");
const porDataENome = (a: ItemJornal, b: ItemJornal) => a.data.localeCompare(b.data) || porNome(a, b);

/** null quando o nome não é gestor do config nem dono de algum item. */
export function montarCaderno(
  itensBrutos: ItemJornal[],
  semPrazoBruto: ItemSemPrazo[],
  hoje: DataISO,
  cfg: JornalConfig,
  nome: string,
  incluirEquipe: boolean,
): Caderno | null {
  const doConfig = cfg.gestores.find((g) => g.nome === nome);
  const ehDono = [...itensBrutos, ...semPrazoBruto].some((i) => i.dono === nome);
  if (!doConfig && !ehDono) return null;

  const equipe = doConfig ? descendentes(nome, cfg) : [];
  const incluiEquipe = incluirEquipe && equipe.length > 0;
  const donos = new Set([nome, ...(incluiEquipe ? equipe : [])]);
  const itens = itensBrutos.filter((i) => donos.has(i.dono) && i.categoria !== "cancelado");
  const semPrazo = semPrazoBruto.filter((i) => donos.has(i.dono) && emAberto(i)).sort(porNome);

  const atrasados: ItemPendencia[] = itens
    .filter((i) => i.data < hoje && emAberto(i))
    .sort(porDataENome)
    .map((item) => ({ item, diasAtraso: diasEntre(item.data, hoje) }));

  const travados: ItemTravado[] = [...itens, ...semPrazo]
    .filter((i) => i.categoria === "travado")
    .sort((a, b) => (a.data === null ? 1 : 0) - (b.data === null ? 1 : 0) || (a.data ?? "").localeCompare(b.data ?? "") || porNome(a, b))
    .map((item) => ({ item, motivo: item.observacao ?? null, diasTravado: null }));

  const deHoje = itens
    .filter((i) => i.data === hoje)
    .sort((a, b) => Number(a.categoria === "concluido") - Number(b.categoria === "concluido") || porNome(a, b));

  const proximos14: GrupoDia[] = [];
  for (let k = 1; k <= 14; k++) {
    const data = somarDias(hoje, k);
    const doDia = itens.filter((i) => i.data === data && emAberto(i)).sort(porNome);
    if (doDia.length) proximos14.push({ data, ehDiaUtil: ehDiaUtil(data, cfg), itens: doDia });
  }

  const inicioMes = `${hoje.slice(0, 8)}01`;
  const doMes = itens.filter((i) => i.data >= inicioMes && i.data <= hoje);

  return {
    gestor: { nome, area: doConfig?.area ?? null, reportaA: doConfig?.reporta_a ?? null },
    temEquipe: equipe.length > 0,
    incluiEquipe,
    atrasados,
    travados,
    hoje: deHoje,
    proximos14,
    semPrazo,
    mes: { concluidos: doMes.filter((i) => i.categoria === "concluido").length, total: doMes.length },
  };
}
