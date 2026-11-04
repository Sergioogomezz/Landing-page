// Activo Dúo · service worker de avisos.
// Los avisos llegan sin contenido (por privacidad): al recibir uno, enseñamos un mensaje genérico
// y, al tocarlo, abrimos la app, que ya muestra qué ha pasado.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.showNotification('Activo Dúo', {
    body: 'Tienes novedades: alguien quiere entrenar contigo o ha respondido a tu propuesta.',
    icon: 'assets/img/duo-192.png',
    badge: 'assets/img/duo-192.png',
    tag: 'activo-duo',
    renotify: true,
    data: { url: 'duo.html' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
    for (const v of ventanas) if (v.url.includes('duo.html') && 'focus' in v) return v.focus();
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || 'duo.html');
  }));
});
