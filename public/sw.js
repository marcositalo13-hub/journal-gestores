// Service worker da A Pauta: só notificações push (sem cache offline).
// Payload esperado: { title, body, tag, url }. Nunca há valores monetários no texto.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : "" };
  }
  const titulo = d.title || "A Pauta";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: d.body || "",
      icon: "/apple-icon",
      badge: "/apple-icon",
      // mesma tag: um evento repetido substitui a notificação anterior em vez de empilhar
      tag: d.tag || "pauta",
      data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      const aberta = abertas.find((c) => new URL(c.url).origin === self.location.origin);
      if (aberta) {
        // foca o app já aberto e leva até o destino
        return aberta.focus().then((c) => (c && "navigate" in c ? c.navigate(destino) : undefined));
      }
      return self.clients.openWindow(destino);
    }),
  );
});
