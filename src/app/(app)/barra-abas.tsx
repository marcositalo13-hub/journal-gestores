"use client";

import { Newspaper, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS: { href: string; rotulo: string; Icone: LucideIcon }[] = [
  { href: "/", rotulo: "Hoje", Icone: Newspaper },
  { href: "/gestores", rotulo: "Gestores", Icone: Users },
];

function ativa(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

// Troca de aba é instantânea (sem animação): é a ação mais repetida do app.
export function BarraAbas() {
  const pathname = usePathname();
  return (
    <nav aria-label="Seções" className="barra-abas fixed inset-x-0 bottom-0 z-10">
      <ul className="mx-auto flex h-[var(--altura-abas)] max-w-[640px]">
        {ABAS.map(({ href, rotulo, Icone }) => {
          const atual = ativa(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={`pressionavel flex h-full min-h-11 flex-col items-center justify-center gap-0.5 ${
                  atual ? "text-destaque" : "text-tinta-2"
                }`}
              >
                <Icone aria-hidden size={24} strokeWidth={atual ? 2.25 : 1.75} />
                <span className={`text-[0.6875rem] leading-none ${atual ? "font-semibold" : "font-medium"}`}>{rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
