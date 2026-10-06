import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlternarEquipe } from "@/components/pauta/alternar-equipe";
import { ErroEdicao } from "@/components/pauta/atualizar";
import { ConteudoLinha } from "@/components/pauta/linha";
import { PillStatus } from "@/components/pauta/pill-status";
import { LinhaItem, MetaItem, Secao } from "@/components/pauta/secao";
import { dataPorExtenso, hoje } from "@/lib/calendario";
import { getConfig } from "@/lib/config";
import { montarCaderno, slugDe } from "@/lib/edicao/caderno";
import { dataDeTeste } from "@/lib/edicao/data-dev";
import { obterItens } from "@/lib/edicao/obter";
import { dataCurta, etapasTexto, haDias } from "@/lib/formato";

export async function generateMetadata({ params }: PageProps<"/gestores/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const g = getConfig().gestores.find((x) => slugDe(x.nome) === slug);
  return { title: g?.nome ?? "Caderno" };
}

export default async function PaginaCaderno({ params, searchParams }: PageProps<"/gestores/[slug]">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const simulada = dataDeTeste(sp.data, process.env.NODE_ENV);
  const comEquipe = sp.equipe === "1";

  // Mesma leitura em cache da edição (sem segunda chamada ao monday).
  const dados = await obterItens().catch((erro: unknown) => {
    console.error("[caderno] itens indisponíveis:", erro instanceof Error ? erro.message : "erro desconhecido");
    return null;
  });
  if (!dados) return <ErroEdicao />;

  const cfg = getConfig();
  const nomes = [...cfg.gestores.map((g) => g.nome), ...new Set([...dados.itens, ...dados.semPrazo].map((i) => i.dono))];
  const nome = nomes.find((n) => slugDe(n) === slug);
  const c = nome ? montarCaderno(dados.itens, dados.semPrazo, simulada ?? hoje(), cfg, nome, comEquipe) : null;
  if (!c) notFound();

  const verDono = c.incluiEquipe;
  const vazio = [c.atrasados, c.travados, c.hoje, c.proximos14, c.semPrazo].every((x) => x.length === 0);
  const pct = c.mes.total > 0 ? (c.mes.concluidos / c.mes.total) * 100 : 0;

  return (
    <>
      <Link href={`/gestores${simulada ? `?data=${simulada}` : ""}`} className="pressionavel -ml-1 inline-flex min-h-11 items-center px-1 text-[0.9375rem] text-tinta-2">
        ‹ Gestores
      </Link>

      {simulada && (
        <p className="mt-2 mb-3 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">
          Simulando {dataPorExtenso(simulada)} (somente em desenvolvimento).
        </p>
      )}

      <header className="mt-1">
        <h2 className="titulo-jornal text-[2rem] leading-[1.1]">{c.gestor.nome}</h2>
        {c.gestor.area && <p className="mt-1.5 text-base text-tinta-2">{c.gestor.area}</p>}
        <p className="mt-0.5 text-[0.9375rem] text-tinta-2">{c.gestor.reportaA ? `Reporta a ${c.gestor.reportaA}` : "Fora da estrutura"}</p>
        {c.temEquipe && <AlternarEquipe primeiroNome={c.gestor.nome.split(" ")[0]} comEquipe={c.incluiEquipe} />}
      </header>

      {/* Resumo (sempre visível) */}
      <section aria-label="Resumo do mês" className="mt-6">
        <p className="text-base">
          Confirmado no mês: <span className="font-semibold tabular-nums">{c.mes.concluidos}</span> de <span className="tabular-nums">{c.mes.total}</span>
        </p>
        <div
          role="progressbar"
          aria-label="Confirmados no mês"
          aria-valuemin={0}
          aria-valuemax={c.mes.total}
          aria-valuenow={c.mes.concluidos}
          className="mt-2 h-0.5 w-full bg-borda"
        >
          <div className="h-full bg-tinta" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-[0.875rem] text-tinta-2">Pontualidade disponível quando houver histórico diário.</p>
      </section>

      {vazio && <p className="mt-8 border-t border-borda pt-5 text-base text-tinta-2">Nada em aberto.</p>}

      {c.atrasados.length > 0 && (
        <Secao id="s-atrasados" titulo="Atrasados">
          <ul>
            {c.atrasados.map(({ item, diasAtraso }) => (
              <LinhaItem key={item.id} item={item}>
                <ConteudoLinha
                  item={item}
                  mostrarTipo={false}
                  meta={<MetaItem item={item} dono={verDono} extras={[`prazo ${dataCurta(item.data)}`]} />}
                  direita={<span className="shrink-0 whitespace-nowrap text-[0.9375rem] font-semibold text-alerta">{haDias(diasAtraso)}</span>}
                />
              </LinhaItem>
            ))}
          </ul>
        </Secao>
      )}

      {c.travados.length > 0 && (
        <Secao id="s-travados" titulo="Travados">
          <ul>
            {c.travados.map(({ item, motivo }) => (
              <LinhaItem key={item.id} item={item}>
                <ConteudoLinha
                  item={item}
                  mostrarTipo={false}
                  meta={
                    <>
                      {motivo ?? "Sem motivo informado"}
                      {(item.etapas || verDono) && (
                        <>
                          <br />
                          <MetaItem item={item} dono={verDono} extras={item.etapas ? [etapasTexto(item.etapas)] : []} />
                        </>
                      )}
                    </>
                  }
                  direita={<PillStatus categoria="travado" status="Travado" />}
                />
              </LinhaItem>
            ))}
          </ul>
        </Secao>
      )}

      {c.hoje.length > 0 && (
        <Secao id="s-hoje" titulo="Hoje">
          <ul>
            {c.hoje.map((item) => (
              <LinhaItem key={item.id} item={item}>
                <ConteudoLinha item={item} meta={<MetaItem item={item} dono={verDono} />} direita={<PillStatus categoria={item.categoria} status={item.status} />} />
              </LinhaItem>
            ))}
          </ul>
        </Secao>
      )}

      {c.proximos14.length > 0 && (
        <Secao id="s-proximos" titulo="Próximos 14 dias">
          {c.proximos14.map((d) => (
            <div key={d.data} className="mt-3">
              <h3 className="rotulo-gestor">
                {dataCurta(d.data)}
                {!d.ehDiaUtil && " · dia não útil"}
              </h3>
              <ul>
                {d.itens.map((item) => (
                  <LinhaItem key={item.id} item={item}>
                    <ConteudoLinha item={item} meta={<MetaItem item={item} dono={verDono} />} direita={<PillStatus categoria={item.categoria} status={item.status} />} />
                  </LinhaItem>
                ))}
              </ul>
            </div>
          ))}
        </Secao>
      )}

      {c.semPrazo.length > 0 && (
        <Secao id="s-sem-prazo" titulo="Sem prazo">
          <ul>
            {c.semPrazo.map((item) => (
              <LinhaItem key={item.id} item={item}>
                <ConteudoLinha item={item} meta={<MetaItem item={item} dono={verDono} />} direita={<PillStatus categoria={item.categoria} status={item.status} />} />
              </LinhaItem>
            ))}
          </ul>
        </Secao>
      )}
    </>
  );
}
