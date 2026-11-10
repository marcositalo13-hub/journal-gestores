"use client";

import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { filtrarGrupos } from "@/lib/busca-pagamentos";
import type { MesAutorizados } from "@/lib/edicao/pagamentos";
import { textoAutorizado } from "@/lib/textos-pagamento";
import { BotaoItem } from "./botao-item";
import { ConteudoLinha } from "./linha";
import { Valor } from "./valor";

/** Histórico de autorizados por mês, com busca por nome, observação ou valor (filtra no aparelho, sem ir ao servidor). */
export function HistoricoAutorizados({ grupos }: { grupos: MesAutorizados[] }) {
  const [busca, setBusca] = useState("");
  const termo = useDeferredValue(busca);
  const visiveis = filtrarGrupos(grupos, termo);

  if (grupos.length === 0) return <p className="py-6 text-base text-tinta-2">Nenhum pagamento autorizado ainda.</p>;

  return (
    <>
      <div className="relative mt-4">
        <Search aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tinta-2" />
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          aria-label="Buscar nos autorizados"
          placeholder="Nome, observação ou valor"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="campo"
          style={{ paddingLeft: "2.5rem" }} // .campo não está em @layer: a utilidade pl-* do Tailwind perderia
        />
      </div>

      {visiveis.length === 0 ? (
        <p role="status" className="py-6 text-base text-tinta-2">
          Nada encontrado.
        </p>
      ) : (
        visiveis.map((g) => (
          <section key={g.chave} aria-labelledby={`mes-${g.chave}`} className="mt-6">
            <h3 id={`mes-${g.chave}`} className="rotulo-tipo border-b border-borda pb-1.5">
              {g.rotulo}
            </h3>
            <ul>
              {g.itens.map((item) => (
                <li key={item.id} className="border-b border-borda last:border-b-0">
                  <BotaoItem item={item}>
                    <ConteudoLinha
                      item={{ ...item, categoria: "aberto" }} // sem o visual "concluído" (nome apagado): aqui a lista é o assunto
                      mostrarTipo={false}
                      meta={
                        <>
                          <span className="block font-semibold tabular-nums text-tinta">{typeof item.valor === "number" ? <Valor valor={item.valor} /> : "Sem valor informado"}</span>
                          <span className="block">{textoAutorizado(item)}</span>
                        </>
                      }
                    />
                  </BotaoItem>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
