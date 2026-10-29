/* =========================================================================
   embed.js — se carga en el ARTÍCULO, no en la animación.
   Calcula cuánto scroll ha recorrido el contenedor y se lo manda al iframe.
   Sin dependencias: no hace falta GSAP en el artículo.
   ========================================================================= */

(function () {
  // Si publicas la animación en otro dominio, pon aquí ese origen exacto
  // en lugar de '*'. Ej: 'https://static.midominio.com'
  const TARGET_ORIGIN = '*';

  const containers = document.querySelectorAll('[data-toledo-scroller]');

  containers.forEach((container) => {
    const iframe = container.querySelector('iframe');
    if (!iframe) return;

    let ticking = false;

    /* En móvil, la barra de direcciones aparece y desaparece al hacer scroll
       y cambia window.innerHeight unas decenas de píxeles. Si usáramos ese
       valor directamente, el progreso daría saltos. Guardamos una altura de
       referencia y solo la actualizamos ante cambios grandes, que son los que
       corresponden de verdad a un giro de pantalla o a un redimensionado. */
    let altura = window.innerHeight;
    function refrescarAltura() {
      if (Math.abs(window.innerHeight - altura) > 160) altura = window.innerHeight;
    }

    function send() {
      const rect = container.getBoundingClientRect();
      // Recorrido útil: desde que el contenedor toca el borde superior
      // hasta que su final alcanza el borde inferior del viewport.
      const travel = rect.height - altura;
      const progress = travel <= 0 ? 0 : Math.min(Math.max(-rect.top / travel, 0), 1);

      iframe.contentWindow.postMessage(
        { type: 'toledo:progress', progress },
        TARGET_ORIGIN
      );
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(send);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { refrescarAltura(); onScroll(); });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => { altura = window.innerHeight; onScroll(); }, 250);
    });

    // Espera a que la animación avise de que está lista
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'toledo:ready') send();
    });

    onScroll();
  });
})();
