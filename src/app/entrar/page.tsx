import type { Metadata } from "next";
import { FormularioEntrar } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaEntrar({ searchParams }: PageProps<"/entrar">) {
  const { erro } = await searchParams;
  const erroInicial = erro === "nao-autorizado" ? "Acesso não autorizado" : null;

  return (
    <main className="topo-seguro mx-auto flex min-h-dvh w-full max-w-[400px] flex-col justify-center px-6 pb-12">
      <h1 className="titulo-jornal mb-2 text-center text-[3.25rem]">A Pauta</h1>
      <p className="mb-10 text-center text-base text-tinta-2">Acesso restrito</p>
      <FormularioEntrar erroInicial={erroInicial} />
    </main>
  );
}
