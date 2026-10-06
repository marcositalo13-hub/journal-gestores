"use client";

import { useActionState } from "react";
import { entrar, type EstadoEntrar } from "./actions";

export function FormularioEntrar({ erroInicial }: { erroInicial: string | null }) {
  const [estado, acao, pendente] = useActionState<EstadoEntrar, FormData>(entrar, { erro: erroInicial, email: "" });

  return (
    <form action={acao} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-[0.9375rem] font-medium text-tinta-2">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={estado.email}
          className="campo"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="senha" className="text-[0.9375rem] font-medium text-tinta-2">
          Senha
        </label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required className="campo" />
      </div>

      <p role="alert" aria-live="polite" className="min-h-6 text-base text-alerta">
        {estado.erro}
      </p>

      <button type="submit" disabled={pendente} className="botao-primario">
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
