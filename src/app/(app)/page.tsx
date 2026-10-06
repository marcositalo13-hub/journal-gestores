import { CalendarClock } from "lucide-react";
import type { ReactNode } from "react";
import { BotaoItem } from "@/components/pauta/botao-item";
import { ErroEdicao } from "@/components/pauta/atualizar";
import { ConteudoLinha } from "@/components/pauta/linha";
import { Manchete } from "@/components/pauta/manchete";
import { PillStatus } from "@/components/pauta/pill-status";
import { SemanaSeletor } from "@/components/pauta/semana-seletor";
import { Valor } from "@/components/pauta/valor";
import { dataPorExtenso } from "@/lib/calendario";
import { getConfig } from "@/lib/config";
import { dataDeTeste } from "@/lib/edicao/data-dev";
import type { ItemEdicao } from "@/lib/edicao/itens";
import { obterEdicao, obterEdicaoEm } from "@/lib/edicao/obter";
import { dataCurta, etapasTexto, haDias, semPrazoTexto, tituloAvisoNaoUtil } from "@/lib/formato";

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8 border-t border-borda pt-5">
      <h2 id={id} className="titulo-secao mb-1">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

const Linha = ({ item, children }: { item: ItemEdicao; children: ReactNode }) => (
  <li className="border-b border-borda last:border-b-0">
    <BotaoItem item={item}>{children}</BotaoItem>
  </li>
);

export default async function PaginaHoje({ searchParams }: PageProps<"/">) {
  // ?data=YYYY-MM-DD simula outro dia, só fora de produção (em produção é ignorado).
  const simulada = dataDeTeste((await searchParams).data, process.env.NODE_ENV);

  const resultado = await (simulada ? obterEdicaoEm(simulada) : obterEdicao()).then(
    (edicao) => ({ edicao }),
    (erro: unknown) => {
      console.error("[hoje] edição indisponível:", erro instanceof Error ? erro.message : "erro desconhecido");
      return { edicao: null };
    },
  );
  if (!resultado.edicao) return <ErroEdicao />;
  const edicao = resultado.edicao;
  const cfg = getConfig();

  // "Hoje" agrupado por gestor, na ordem do config (donos fora do config vêm por último).
  const gruposHoje = edicao.gestores
    .map((g) => ({ nome: g.nome, itens: edicao.hoje.filter((i) => i.dono === g.nome) }))
    .filter((g) => g.itens.length > 0);

  return (
    <>
      {simulada && (
        <p className="mb-5 rounded-lg bg-papel-alt px-3 py-2 text-[0.9375rem] text-tinta-2">
          Simulando {dataPorExtenso(simulada)} (somente em desenvolvimento).
        </p>
      )}

      <Manchete manchete={edicao.manchete} hoje={edicao.data} />

      <Secao id="s-hoje" titulo="Hoje">
        {gruposHoje.length === 0 ? (
          <p className="py-3 text-base text-tinta-2">Nada vence hoje.</p>
        ) : (
          gruposHoje.map((g) => (
            <div key={g.nome} className="mt-3">
              <h3 className="rotulo-gestor">{g.nome}</h3>
              <ul>
                {g.itens.map((item) => (
                  <Linha key={item.id} item={item}>
                    <ConteudoLinha
                      item={item}
                      meta={
                        typeof item.valor === "number" ? (
                          <>
                            <Valor valor={item.valor} />
                            {item.favorecido && ` · ${item.favorecido}`}
                          </>
                        ) : undefined
                      }
                      direita={<PillStatus categoria={item.categoria} status={item.status} />}
                    />
                  </Linha>
                ))}
              </ul>
            </div>
          ))
        )}
      </Secao>

      {edicao.pendencias.length > 0 && (
        <Secao id="s-pendencias" titulo="Pendências">
          <ul>
            {edicao.pendencias.map(({ item, diasAtraso }) => (
              <Linha key={item.id} item={item}>
                <ConteudoLinha
                  item={item}
                  mostrarTipo={false}
                  meta={`${item.dono} · prazo ${dataCurta(item.data)}`}
                  direita={<span className="shrink-0 whitespace-nowrap text-[0.9375rem] font-semibold text-alerta">{haDias(diasAtraso)}</span>}
                />
              </Linha>
            ))}
          </ul>
        </Secao>
      )}

      {edicao.travados.length > 0 && (
        <Secao id="s-travados" titulo="Travados">
          <ul>
            {edicao.travados.map(({ item, motivo }) => (
              <Linha key={item.id} item={item}>
                <ConteudoLinha
                  item={item}
                  mostrarTipo={false}
                  meta={
                    <>
                      {motivo ?? "Sem motivo informado"}
                      {item.etapas && (
                        <>
                          <br />
                          {etapasTexto(item.etapas)}
                        </>
                      )}
                    </>
                  }
                  direita={<PillStatus categoria="travado" status="Travado" />}
                />
              </Linha>
            ))}
          </ul>
        </Secao>
      )}

      {edicao.avisoNaoUtil && (
        <section aria-labelledby="s-aviso" className="mt-8 rounded-xl border border-aviso/30 bg-aviso/[0.07] px-4 pt-4 pb-2">
          <h2 id="s-aviso" className="titulo-secao flex items-center gap-2 text-aviso">
            <CalendarClock aria-hidden size={20} strokeWidth={2} />
            {tituloAvisoNaoUtil(edicao.data, edicao.avisoNaoUtil.proximoDiaUtil, cfg)}
          </h2>
          <ul className="mt-1">
            {edicao.avisoNaoUtil.itens.map(({ item, rotulo }) => (
              <li key={item.id} className="border-b border-aviso/20 last:border-b-0">
                <BotaoItem item={item} className="-mx-4 w-[calc(100%+2rem)] px-4">
                  <span className="block min-w-0 flex-1 py-3">
                    <span className="block text-[0.9375rem] font-semibold text-aviso">{rotulo}</span>
                    <span className="nome-item">{item.nome}</span>
                    <span className="meta-item">{item.dono}</span>
                  </span>
                </BotaoItem>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Secao id="s-semana" titulo="Próximos 7 dias">
        <div className="mt-3">
          <SemanaSeletor key={edicao.semana[0].data} dias={edicao.semana} />
        </div>
      </Secao>

      {edicao.semPrazo.length > 0 && <p className="mt-10 text-[0.9375rem] text-tinta-2">{semPrazoTexto(edicao.semPrazo.length)}</p>}
    </>
  );
}
