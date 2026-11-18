/*!
 * Activonorte · Aviso y preferencias de cookies
 * ---------------------------------------------------------------
 * - Primera capa con "Aceptar todas", "Rechazar" y "Configurar", con el mismo peso visual
 *   (criterio de la AEPD, guía de cookies de 2023).
 * - Las cookies técnicas siempre están activas; análisis y publicidad solo si se aceptan.
 * - La elección se guarda 13 meses en este navegador y se puede cambiar en cualquier momento
 *   con cualquier enlace o botón que tenga el atributo data-cookie-settings.
 *
 * Cómo activar Google Analytics o el Píxel de Meta en el futuro:
 *   rellena GA4_ID y/o META_PIXEL_ID aquí abajo (o en los atributos data-ga4 / data-meta-pixel
 *   de la etiqueta <script>). Solo se cargarán a quien las acepte. Recuerda añadirlas también
 *   a la tabla de la Política de cookies.
 */
(function () {
  'use strict';

  var script = document.currentScript || {};
  var ds = script.dataset || {};
  var GA4_ID = ds.ga4 || '';              // p. ej. 'G-XXXXXXXXXX'
  var META_PIXEL_ID = ds.metaPixel || ''; // p. ej. '123456789012345'
  var POLITICA = ds.politica || 'https://activonorte.com/cookies.html';
  var KEY = 'an_cookies_v1';
  var VERSION = 1;
  var DURACION_MS = 395 * 24 * 60 * 60 * 1000; // 13 meses

  function leer() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!c || c.v !== VERSION || !(Date.now() - c.fecha < DURACION_MS)) return null;
      return c;
    } catch (e) { return null; }
  }
  function guardar(analitica, publicidad) {
    var c = { v: VERSION, fecha: Date.now(), analitica: !!analitica, publicidad: !!publicidad };
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
    aplicar(c);
    try { window.dispatchEvent(new CustomEvent('an:cookies', { detail: c })); } catch (e) {}
    return c;
  }

  /* ── Carga de herramientas opcionales, solo con consentimiento ── */
  var cargadoGA = false, cargadoPixel = false;
  function aplicar(c) {
    if (!c) return;
    if (c.analitica && GA4_ID && !cargadoGA) {
      cargadoGA = true;
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', GA4_ID, { anonymize_ip: true });
    }
    if (c.publicidad && META_PIXEL_ID && !cargadoPixel) {
      cargadoPixel = true;
      /* Código oficial del Píxel de Meta */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', META_PIXEL_ID);
      window.fbq('track', 'PageView');
    }
  }

  /* ── Interfaz ── */
  var css = '' +
    '.anck{position:fixed;left:16px;bottom:16px;z-index:2147483000;max-width:540px;width:calc(100% - 32px);background:#fff;color:#0f1f24;border:1px solid #dfe5e6;border-radius:18px;box-shadow:0 24px 60px -18px rgba(0,26,32,.45);padding:20px 20px 18px;font:15px/1.55 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:anckIn .3s ease}' +
    '@keyframes anckIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}' +
    '.anck h2{font-size:16px;font-weight:800;margin:0 0 6px;color:#003b46;letter-spacing:-.01em}' +
    '.anck p{margin:0 0 14px;color:#33464b;font-size:14px}' +
    '.anck a{color:#003b46;font-weight:700;text-decoration:underline;text-underline-offset:3px}' +
    '.anck-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.anck button{font:inherit;font-weight:700;font-size:14px;border-radius:10px;padding:11px 14px;cursor:pointer;border:2px solid #003b46;transition:background-color .2s,color .2s}' +
    '.anck .anck-si,.anck .anck-no{background:#003b46;color:#fff}' +
    '.anck .anck-si:hover,.anck .anck-no:hover{background:#00262e}' +
    '.anck .anck-cfg{grid-column:1/-1;background:#fff;color:#003b46}' +
    '.anck .anck-cfg:hover{background:#eef5f6}' +
    '.anck button:focus-visible{outline:3px solid #ff7a1a;outline-offset:2px}' +
    '.anck-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(0,15,19,.6);display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.anck-ov .anck{position:relative;left:auto;bottom:auto;max-width:560px;width:100%;max-height:90vh;overflow:auto}' +
    '.anck-cat{border:1px solid #dfe5e6;border-radius:12px;padding:12px 14px;margin:0 0 10px}' +
    '.anck-cat label{display:flex;align-items:center;justify-content:space-between;gap:12px;font-weight:800;color:#0f1f24;cursor:pointer}' +
    '.anck-cat small{display:block;color:#5b6b70;font-size:13px;margin-top:4px;line-height:1.45}' +
    '.anck-cat input{width:20px;height:20px;accent-color:#c75300;flex:none}' +
    '.anck-fijo{font-size:12px;font-weight:700;color:#127a3f;background:#dcfce7;border-radius:999px;padding:3px 9px;flex:none}' +
    '@media (max-width:600px){.anck{left:8px;bottom:8px;width:calc(100% - 16px);padding:16px}.anck-btns{grid-template-columns:1fr 1fr}}' +
    /* Ordenador: barra horizontal fina abajo, texto a la izquierda y botones en fila */
    '@keyframes anckBar{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}' +
    '@media (min-width:900px){.anck-bar{left:50%;bottom:18px;transform:translateX(-50%);max-width:1180px;width:calc(100% - 48px);display:flex;align-items:center;gap:28px;padding:16px 18px 16px 24px;animation:anckBar .3s ease}' +
    '.anck-bar .anck-txt{flex:1;min-width:0}.anck-bar h2{font-size:15px;margin-bottom:2px}.anck-bar p{margin:0;font-size:13.5px}' +
    '.anck-bar .anck-btns{display:flex;gap:8px;flex:none}.anck-bar .anck-cfg{grid-column:auto;order:-1}.anck-bar button{white-space:nowrap;padding:11px 20px}}' +
    /* Mientras el aviso está abierto, el botón del asistente sube por encima para no quedar tapado */
    'html.anck-abierto .chat-trigger{bottom:calc(var(--anck-h,0px) + 28px)!important;transition:bottom .3s ease}html.anck-abierto .chat-teaser{display:none!important}';

  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }
  function estilos() {
    if (document.getElementById('anck-css')) return;
    var s = document.createElement('style'); s.id = 'anck-css'; s.textContent = css; document.head.appendChild(s);
  }

  var banner = null;
  function medir() { if (banner) document.documentElement.style.setProperty('--anck-h', banner.offsetHeight + 'px'); }
  function cerrarBanner() {
    if (banner) { banner.remove(); banner = null; }
    document.documentElement.classList.remove('anck-abierto');
    window.removeEventListener('resize', medir);
  }

  function mostrarBanner() {
    if (banner) return;
    estilos();
    banner = el('<section class="anck anck-bar" role="dialog" aria-live="polite" aria-labelledby="anck-t">' +
      '<div class="anck-txt"><h2 id="anck-t">Tu privacidad, tus reglas 🍪</h2>' +
      '<p>Usamos cookies propias técnicas, necesarias para que la web funcione. Solo si nos das permiso usaremos además cookies de análisis y de publicidad para medir las visitas y mejorar nuestros anuncios. Puedes aceptarlas, rechazarlas o elegir. <a href="' + POLITICA + '">Política de cookies</a>.</p></div>' +
      '<div class="anck-btns">' +
      '<button type="button" class="anck-no" data-anck="no">Rechazar</button>' +
      '<button type="button" class="anck-si" data-anck="si">Aceptar todas</button>' +
      '<button type="button" class="anck-cfg" data-anck="cfg">Configurar</button>' +
      '</div></section>');
    document.body.appendChild(banner);
    medir();
    document.documentElement.classList.add('anck-abierto');
    window.addEventListener('resize', medir);
    banner.addEventListener('click', function (e) {
      var b = e.target.closest('[data-anck]'); if (!b) return;
      var a = b.getAttribute('data-anck');
      if (a === 'si') { guardar(true, true); cerrarBanner(); }
      else if (a === 'no') { guardar(false, false); cerrarBanner(); }
      else { cerrarBanner(); abrirPreferencias(); }
    });
  }

  function abrirPreferencias() {
    estilos();
    var c = leer() || { analitica: false, publicidad: false };
    var previo = document.activeElement;
    var ov = el('<div class="anck-ov"><section class="anck" role="dialog" aria-modal="true" aria-labelledby="anck-pt">' +
      '<h2 id="anck-pt">Configurar cookies</h2>' +
      '<p>Elige qué cookies permites. Puedes cambiarlo cuando quieras desde el enlace «Configurar cookies» del pie de la web. <a href="' + POLITICA + '">Más información</a>.</p>' +
      '<div class="anck-cat"><label>Técnicas (necesarias) <span class="anck-fijo">Siempre activas</span></label><small>Permiten que la web funcione: recordar esta elección, mantener tu sesión en la Sala de Control o en Activo Dúo. No se pueden desactivar.</small></div>' +
      '<div class="anck-cat"><label for="anck-an">Análisis <input type="checkbox" id="anck-an"' + (c.analitica ? ' checked' : '') + '></label><small>Nos ayudan a saber cuántas personas visitan la web y qué páginas usan, de forma agregada.</small></div>' +
      '<div class="anck-cat"><label for="anck-pu">Publicidad <input type="checkbox" id="anck-pu"' + (c.publicidad ? ' checked' : '') + '></label><small>Permiten medir y mejorar nuestros anuncios en redes sociales (por ejemplo, Meta).</small></div>' +
      '<div class="anck-btns">' +
      '<button type="button" class="anck-no" data-anck="no">Rechazar todas</button>' +
      '<button type="button" class="anck-si" data-anck="si">Aceptar todas</button>' +
      '<button type="button" class="anck-cfg" data-anck="guardar">Guardar mi selección</button>' +
      '</div></section></div>');
    document.body.appendChild(ov);
    var primero = ov.querySelector('button');
    if (primero) primero.focus();
    function cerrar() { ov.remove(); if (previo && previo.focus) previo.focus(); }
    ov.addEventListener('click', function (e) {
      if (e.target === ov) { if (leer()) cerrar(); return; }
      var b = e.target.closest('[data-anck]'); if (!b) return;
      var a = b.getAttribute('data-anck');
      if (a === 'si') guardar(true, true);
      else if (a === 'no') guardar(false, false);
      else guardar(ov.querySelector('#anck-an').checked, ov.querySelector('#anck-pu').checked);
      cerrar();
    });
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape' && leer()) cerrar(); });
  }

  // Cualquier elemento con data-cookie-settings abre las preferencias
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-cookie-settings]');
    if (!t) return;
    e.preventDefault();
    cerrarBanner();
    abrirPreferencias();
  });

  window.ActivonorteCookies = {
    abrir: abrirPreferencias,
    estado: leer
  };

  function iniciar() {
    var c = leer();
    if (c) aplicar(c); else mostrarBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
