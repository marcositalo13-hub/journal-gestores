"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { salvarInscricao } from "@/app/(app)/push";
import { chaveParaBytes, estadoNotificacoes, type EstadoPush } from "@/lib/push/estado";

const EVENTO = "pauta:push";
const CHAVE_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function lerEstado(): EstadoPush {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return estadoNotificacoes({
    ios,
    standalone,
    suportado: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    chaveOk: Boolean(CHAVE_VAPID),
    permissao: "Notification" in window ? Notification.permission : "default",
  });
}

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO, aviso);
  return () => window.removeEventListener(EVENTO, aviso);
}
const noServidor = (): EstadoPush | null => null;

/** Estado das notificações neste aparelho (null no servidor e na hidratação: evita piscar). Registra o service worker só se houver suporte. */
function useNotificacoes() {
  const estado = useSyncExternalStore<EstadoPush | null>(assinar, lerEstado, noServidor);
  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return { estado };
}

async function ativar(): Promise<boolean> {
  // a permissão é pedida SÓ aqui, no toque do botão
  if ((await Notification.requestPermission()) !== "granted") return false;
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(CHAVE_VAPID ?? "") as BufferSource }));
  const j = sub.toJSON();
  const r = await salvarInscricao({ endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" });
  if (!r.ok) throw new Error(r.erro);
  return true;
}

/** Cartão discreto no topo de Hoje: instalar o app, ativar avisos ou explicar como reativar. Some quando ativo. */
export function CartaoNotificacoes() {
  const { estado } = useNotificacoes();
  const [pendente, setPendente] = useState(false);

  if (!estado || estado === "ativo" || estado === "indisponivel") return null;

  async function aoAtivar() {
    setPendente(true);
    try {
      if (await ativar()) toast("Notificações ativadas");
    } catch {
      toast("Não foi possível ativar agora. Tente de novo.");
    } finally {
      setPendente(false);
      window.dispatchEvent(new Event(EVENTO)); // reavalia o estado (cartão e link de teste)
    }
  }

  return (
    <section aria-label="Notificações" data-cartao-notificacoes className="mb-5 rounded-xl border border-borda bg-papel-alt px-4 py-3 text-[0.9375rem] leading-snug text-tinta-2">
      {estado === "instalar" && <p>Para receber avisos, adicione A Pauta à Tela de Início (Compartilhar → Adicionar à Tela de Início).</p>}
      {estado === "ativar" && (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-tinta">Receba avisos de novidades importantes</p>
          <button
            type="button"
            onClick={aoAtivar}
            disabled={pendente}
            className="pressionavel min-h-11 shrink-0 rounded-lg border border-tinta px-3 text-[0.9375rem] font-semibold text-tinta disabled:opacity-50"
          >
            {pendente ? "Ativando…" : "Ativar notificações"}
          </button>
        </div>
      )}
      {estado === "negado" && <p>As notificações estão bloqueadas. Para receber avisos, abra Ajustes do iPhone → Notificações → A Pauta e permita as notificações.</p>}
    </section>
  );
}

/** Link discreto no fim de Hoje (só com notificações ativas): envia uma notificação de teste a este leitor. */
export function TesteNotificacao() {
  const { estado } = useNotificacoes();
  const [enviando, setEnviando] = useState(false);
  if (estado !== "ativo") return null;

  async function testar() {
    setEnviando(true);
    try {
      const r = await fetch("/api/notificacoes/teste", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { enviados?: number };
      if (!r.ok) toast("Não foi possível enviar agora.");
      else if (!j.enviados) toast("Nenhum aparelho inscrito. Ative as notificações neste aparelho.");
      else toast("Notificação de teste enviada");
    } catch {
      toast("Não foi possível enviar agora.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={testar}
        disabled={enviando}
        className="pressionavel min-h-11 px-3 text-[0.9375rem] text-tinta-2 underline decoration-borda decoration-1 underline-offset-4 disabled:opacity-50"
      >
        {enviando ? "Enviando…" : "Enviar notificação de teste"}
      </button>
    </div>
  );
}
