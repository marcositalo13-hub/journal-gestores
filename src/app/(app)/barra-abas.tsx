"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/", rotulo: "Hoje" },
  { href: "/gestores", rotulo: "Gestores" },
] as const;

function ativa(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// Linguagem de jornal: rótulos em Newsreader, sem ícones nem cor de destaque.
// A aba ativa ganha tinta e uma régua de 2px acima do rótulo, que desliza (só transform).
export function BarraAbas() {
  const pathname = usePathname();
  const indice = Math.max(0, ABAS.findIndex((a) => ativa(pathname, a.href)));

  return (
    <nav aria-label="Seções" className="barra-abas fixed inset-x-0 bottom-0 z-10">
      <div className="relative mx-auto max-w-[640px]">
        <span
          aria-hidden
          className="regua-tinta absolute top-0 left-0 h-0.5 bg-tinta"
          style={{ width: `${100 / ABAS.length}%`, transform: `translateX(${indice * 100}%)` }}
        />
        <ul className="flex h-[var(--altura-abas)]">
          {ABAS.map(({ href, rotulo }, i) => {
            const atual = i === indice;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={atual ? "page" : undefined}
                  className={cn(
                    "aba flex h-full min-h-11 items-center justify-center font-jornal text-[1.125rem] tracking-[-0.005em]",
                    atual ? "font-semibold text-tinta" : "font-medium text-tinta-2",
                  )}
                >
                  {rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
