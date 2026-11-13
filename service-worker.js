self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title || "Pengingat PioBot", {
    body: payload.body || "Ada pembaruan agenda.",
    icon: "/assets/agentpio-avatar.jpeg",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "piobot-reminder",
    data: { url: payload.url || "/" },
    renotify: false
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    return existing ? existing.focus().then(() => existing.navigate(target)) : self.clients.openWindow(target);
  }));
});
