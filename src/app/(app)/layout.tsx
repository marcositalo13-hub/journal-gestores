import { redirect } from "next/navigation";
import { Suspense } from "react";
import { dataPorExtenso, hoje, horaMinuto, saudacao } from "@/lib/calendario";
import { getConfig, leitorPorEmail } from "@/lib/config";
import { dataCurta } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/server";
import { AlternarValores } from "@/components/pauta/alternar-valores";
import { CabecalhoApp } from "@/components/pauta/cabecalho-app";
import { Atualizado } from "@/components/pauta/atualizado";
import { ProvedorDetalhe } from "@/components/pauta/detalhe";
import { sair } from "../entrar/actions";
import { BarraAbas } from "./barra-abas";

// Defesa em profundidade: o proxy já barra, mas a página também verifica.
async function exigirLeitor() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (!email) redirect("/entrar");
  const leitor = leitorPorEmail(email);
  if (!leitor) redirect("/entrar?erro=nao-autorizado");
  return leitor;
}

export default async function LayoutApp({ children }: LayoutProps<"/">) {
  const leitor = await exigirLeitor();
  const agora = new Date();
  const hora = horaMinuto(agora);
  const dia = hoje(agora);
  const diretorio = Object.fromEntries(getConfig().gestores.map((g) => [g.nome, { area: g.area, whatsapp: g.whatsapp }]));

  return (
    <ProvedorDetalhe gestores={diretorio}>
      <div className="flex min-h-dvh flex-col">
        <CabecalhoApp
          acoes={
            <>
              <AlternarValores />
              <form action={sair}>
                <button type="submit" className="pressionavel -mr-3 min-h-11 min-w-11 px-3 text-[0.9375rem] text-tinta-2">
                  Sair
                </button>
              </form>
            </>
          }
          saudacao={`${saudacao(hora.h)}, ${leitor.nome}. Estas são as prioridades de hoje.`}
          dataExtenso={<time dateTime={dia}>{dataPorExtenso(dia)}</time>}
          dataCompacta={<time dateTime={dia}>{dataCurta(dia)}</time>}
          // Suspense: a leitura do monday (cache frio ~2 s) não bloqueia o cabeçalho.
          atualizado={
            <Suspense fallback={<span>atualizando…</span>}>
              <Atualizado />
            </Suspense>
          }
        />

        {/* espaço para a barra de abas fixa + área segura inferior */}
        <main className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-6 pb-[calc(var(--altura-abas)+env(safe-area-inset-bottom)+1.5rem)]">
          {children}
        </main>

        <BarraAbas />
      </div>
    </ProvedorDetalhe>
  );
}
