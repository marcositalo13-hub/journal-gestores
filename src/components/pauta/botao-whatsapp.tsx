import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Botão de tinta (linguagem de jornal, sem verde de marca). Abre o WhatsApp em nova aba/app. */
export function BotaoWhatsapp({ href, primeiroNome, className }: { href: string; primeiroNome: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("pressionavel flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-tinta px-4 text-[1.0625rem] font-semibold text-papel", className)}
    >
      <MessageCircle aria-hidden size={20} strokeWidth={2} />
      Falar com {primeiroNome} no WhatsApp
    </a>
  );
}
