// Estado do cartão de notificações. Puro e sem imports (serve ao cliente).
export type EstadoPush = "instalar" | "ativar" | "ativo" | "negado" | "indisponivel";

export function estadoNotificacoes(a: {
  ios: boolean;
  standalone: boolean;
  /** serviceWorker + PushManager + Notification existem */
  suportado: boolean;
  /** a chave pública VAPID está configurada */
  chaveOk: boolean;
  permissao: "default" | "granted" | "denied";
}): EstadoPush {
  // No iPhone, push só funciona no app instalado na Tela de Início
  if (a.ios && !a.standalone) return "instalar";
  if (!a.suportado || !a.chaveOk) return "indisponivel";
  if (a.permissao === "granted") return "ativo";
  if (a.permissao === "denied") return "negado";
  return "ativar";
}

/** applicationServerKey exige bytes; a chave VAPID vem em base64url. */
export function chaveParaBytes(base64url: string): Uint8Array {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
