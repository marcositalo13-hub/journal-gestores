"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { salvarWhatsapp } from "@/app/(app)/contatos";
import { formatarWhatsapp, normalizarWhatsapp } from "@/lib/contatos";
import { cn } from "@/lib/utils";
import { urlWhatsapp } from "@/lib/whatsapp";
import { BotaoWhatsapp } from "./botao-whatsapp";

const MSG_INVALIDO = "Número inválido. Use DDD + número.";

/**
 * Contato com o gestor. Sem número: botão "Adicionar WhatsApp de {nome}" que abre o formulário.
 * Com número: botão de tinta que abre o WhatsApp com a mensagem pronta + link "Editar número".
 * O número vem do servidor (só páginas atrás do login); a mensagem nunca inclui valores.
 */
export function ContatoWhatsapp({
  slug,
  primeiroNome,
  numero,
  mensagem,
  className,
}: {
  slug: string;
  primeiroNome: string;
  numero?: string;
  mensagem: string;
  className?: string;
}) {
  const router = useRouter();
  const [salvo, setSalvo] = useState<string | null>(null);
  const atual = salvo ?? numero ?? null;
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function abrir() {
    setTexto(atual ? formatarWhatsapp(atual) : "");
    setErro(null);
    setEditando(true);
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!normalizarWhatsapp(texto)) return setErro(MSG_INVALIDO);
    setErro(null);
    iniciar(async () => {
      const r = await salvarWhatsapp(slug, texto).catch(() => null);
      if (r?.ok) {
        setSalvo(r.numero);
        setEditando(false);
        toast("Número salvo");
        router.refresh();
      } else setErro(r?.erro === "invalido" ? MSG_INVALIDO : "Não foi possível salvar agora. Tente de novo.");
    });
  }

  if (editando) {
    return (
      <form onSubmit={enviar} noValidate className={cn("w-full", className)}>
        <label htmlFor={`wa-${slug}`} className="block text-[0.9375rem] text-tinta-2">
          WhatsApp de {primeiroNome}
        </label>
        <input
          id={`wa-${slug}`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(61) 99999-9999"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErro(null);
          }}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `wa-${slug}-erro` : undefined}
          className="campo mt-1.5"
        />
        {erro && (
          <p id={`wa-${slug}-erro`} role="alert" className="mt-1.5 text-[0.9375rem] text-alerta">
            {erro}
          </p>
        )}
        <div className="mt-3 flex gap-3">
          <button type="submit" disabled={pendente} className="botao-primario flex-1 px-4">
            {pendente ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(false)}
            disabled={pendente}
            className="pressionavel min-h-12 flex-1 rounded-xl border border-borda px-4 text-[1.0625rem] font-semibold text-tinta"
          >
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  if (!atual) {
    return (
      <button
        type="button"
        onClick={abrir}
        className={cn("pressionavel flex min-h-12 w-full items-center justify-center rounded-xl border border-tinta px-4 text-[1.0625rem] font-semibold text-tinta", className)}
      >
        Adicionar WhatsApp de {primeiroNome}
      </button>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <BotaoWhatsapp href={urlWhatsapp(atual, mensagem)} primeiroNome={primeiroNome} />
      <div className="mt-1 flex justify-center">
        <button type="button" onClick={abrir} className="pressionavel min-h-11 px-3 text-[0.9375rem] text-tinta-2 underline decoration-borda decoration-1 underline-offset-4">
          Editar número
        </button>
      </div>
    </div>
  );
}
