import type { Metadata } from "next";
import { ErroEdicao } from "@/components/pauta/atualizar";
import { CelulaGestor } from "@/components/pauta/celula-gestor";
import { dataPorExtenso } from "@/lib/calendario";
import { areaCurta, getConfig } from "@/lib/config";
import { hierarquia, slugDe } from "@/lib/edicao/caderno";
import { dataDeTeste } from "@/lib/edicao/data-dev";
import { obterEdicao, obterEdicaoEm } from "@/lib/edicao/obter";
import { urlsDasFotos } from "@/lib/fotos-servidor";

export const metadata: Metadata = { title: "Gestores" };

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

  const cfg = getConfig();
  const porNome = new Map(resultado.edicao.gestores.map((g) => [g.nome, g]));
  const qs = simulada ? `?data=${simulada}` : "";

  // Topo da hierarquia (reporta a alguém fora da lista: o diretor) sozinho; os demais na ordem do config.
  const topo = hierarquia(cfg).find((h) => h.nivel === 0)?.nome ?? cfg.gestores[0].nome;
  const demais = cfg.gestores.map((g) => g.nome).filter((n) => n !== topo);
  const fora = resultado.edicao.gestores.filter((g) => g.area === null).map((g) => g.nome);

  const fotos = await urlsDasFotos([topo, ...demais, ...fora]);
  const celula = (nome: string, grande?: boolean) => {
    const g = porNome.get(nome);
    return (
      <CelulaGestor
        key={nome}
        nome={nome}
        areaCurta={areaCurta(nome)}
        url={fotos[nome]}
        href={`/gestores/${slugDe(nome)}${qs}`}
        contagens={g?.contagens ?? { atrasados: 0, travados: 0, semPrazo: 0 }}
        nivel={g?.nivel ?? null}
        grande={grande}
      />
    );
  };

  return (
    <>
      {simulada && (
        <p className="mb-5 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">
          Simulando {dataPorExtenso(simulada)} (somente em desenvolvimento).
        </p>
      )}
      <h2 className="titulo-jornal text-[1.75rem]">Gestores</h2>

      <div className="mt-5 flex justify-center">{celula(topo, true)}</div>
      <div className="mt-4 grid grid-cols-3 gap-x-2 gap-y-4">{demais.map((n) => celula(n))}</div>

      {fora.length > 0 && (
        <section aria-labelledby="s-fora" className="mt-8 border-t border-borda pt-5">
          <h3 id="s-fora" className="rotulo-gestor">
            Fora da estrutura
          </h3>
          <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-4">{fora.map((n) => celula(n))}</div>
        </section>
      )}
    </>
  );
}
