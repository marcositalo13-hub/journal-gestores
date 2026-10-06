import type { Metadata } from "next";

export const metadata: Metadata = { title: "Gestores" };

export default function PaginaGestores() {
  return (
    <section aria-labelledby="titulo-gestores">
      <h2 id="titulo-gestores" className="titulo-jornal text-[1.75rem]">
        Gestores
      </h2>
      <p className="mt-3 text-base text-tinta-2">Em construção.</p>
    </section>
  );
}
