import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ErroEdicao } from "@/components/pauta/atualizar";
import { dataPorExtenso } from "@/lib/calendario";
import { getConfig } from "@/lib/config";
import { hierarquia, slugDe } from "@/lib/edicao/caderno";
import { dataDeTeste } from "@/lib/edicao/data-dev";
import type { ResumoGestor } from "@/lib/edicao/montar";
import { obterEdicao, obterEdicaoEm } from "@/lib/edicao/obter";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Gestores" };

/** "hoje N · atrasados N · travados N" (texto sempre presente; alerta só quando > 0) ou "em dia". */
function Contagens({ c }: { c: ResumoGestor["contagens"] }) {
  if (c.hoje + c.atrasados + c.travados + c.semPrazo === 0) return <span className="text-tinta-2">em dia</span>;
  const alerta = (n: number) => (n > 0 ? "font-semibold text-alerta" : undefined);
  return (
    <>
      hoje {c.hoje} · <span className={alerta(c.atrasados)}>atrasados {c.atrasados}</span> · <span className={alerta(c.travados)}>travados {c.travados}</span>
      {c.semPrazo > 0 && ` · sem prazo ${c.semPrazo}`}
    </>
  );
}

function LinhaGestor({ g, nivel, qs }: { g: ResumoGestor; nivel: number; qs: string }) {
  return (
    <li className="border-b border-borda last:border-b-0">
      <Link href={`/gestores/${slugDe(g.nome)}${qs}`} className="linha -mx-5 flex w-[calc(100%+2.5rem)] items-center gap-3 px-5 py-3">
        {/* recuo por nível + fio vertical, como num organograma de jornal */}
        <span className="block min-w-0 flex-1" style={{ paddingLeft: `${nivel * 1.125}rem` }}>
          <span className={cn("block", nivel > 0 && "border-l border-borda pl-3")}>
            <span className="nome-item">{g.nome}</span>
            {g.area && <span className="block text-[0.875rem] leading-snug text-tinta-2">{g.area}</span>}
            <span className="mt-1 block text-[0.9375rem] leading-snug tabular-nums text-tinta">
              <Contagens c={g.contagens} />
            </span>
          </span>
        </span>
        <ChevronRight aria-hidden size={18} className="shrink-0 text-tinta-2/70" />
      </Link>
    </li>
  );
}

export default async function PaginaGestores({ searchParams }: PageProps<"/gestores">) {
  const simulada = dataDeTeste((await searchParams).data, process.env.NODE_ENV);
  const resultado = await (simulada ? obterEdicaoEm(simulada) : obterEdicao()).then(
    (edicao) => ({ edicao }),
    (erro: unknown) => {
      console.error("[gestores] edição indisponível:", erro instanceof Error ? erro.message : "erro desconhecido");
      return { edicao: null };
    },
  );
  if (!resultado.edicao) return <ErroEdicao />;
  const { gestores } = resultado.edicao;
  const qs = simulada ? `?data=${simulada}` : "";

  const porNome = new Map(gestores.map((g) => [g.nome, g]));
  const arvore = hierarquia(getConfig()).flatMap(({ nome, nivel }) => {
    const g = porNome.get(nome);
    return g ? [{ g, nivel }] : [];
  });
  const fora = gestores.filter((g) => g.area === null);

  return (
    <>
      {simulada && (
        <p className="mb-5 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">
          Simulando {dataPorExtenso(simulada)} (somente em desenvolvimento).
        </p>
      )}
      <h2 className="titulo-jornal text-[1.75rem]">Gestores</h2>
      <ul className="mt-3 border-t border-borda">
        {arvore.map(({ g, nivel }) => (
          <LinhaGestor key={g.nome} g={g} nivel={nivel} qs={qs} />
        ))}
      </ul>

      {fora.length > 0 && (
        <section aria-labelledby="s-fora" className="mt-8 border-t border-borda pt-5">
          <h3 id="s-fora" className="rotulo-gestor">
            Fora da estrutura
          </h3>
          <ul className="mt-1">
            {fora.map((g) => (
              <LinhaGestor key={g.nome} g={g} nivel={0} qs={qs} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
