/* =========================================================================
   Animación accidente Toledo — Newtral
   -------------------------------------------------------------------------
   Secuencia de imágenes controlada por scroll, con fundido cruzado.
   Pensada para pocas imágenes (15-20): cada una se mantiene estable un
   tramo y funde sobre la siguiente al final del tramo.

   Dos modos, detectados solos:
     · standalone → el scroll de esta página mueve la animación
     · embed      → el artículo que contiene el iframe envía el progreso
   ========================================================================= */

const CONFIG = {
  // Ruta de las imágenes. {i} se sustituye por el número con ceros delante.
  path: 'frames/img_{i}.webp',
  firstFrame: 1,
  lastFrame: 4,
  padding: 3,          // img_001 → 3 dígitos

  // Fracción del tramo de cada imagen dedicada al fundido hacia la siguiente.
  // 0.45 → la imagen se ve limpia el 55 % del tiempo y funde el 45 % restante.
  // Bájalo para cortes más marcados, súbelo para un flujo más continuo.
  // Con pocas imágenes conviene bajarlo; con 15-20, 0.45 va bien.
  fadeRatio: 0.3,

  // Tramo final de scroll en el que ya no cambia nada: la última imagen se
  // queda quieta para poder leerla antes de salir de la pieza.
  tailHold: 0.12,

  smoothing: 0.14,     // inercia del scrub: 0 = ninguna, 1 = instantáneo
  concurrency: 6,      // descargas simultáneas en la precarga
  readyThreshold: 1,   // son pocas imágenes: se cargan todas antes de empezar

  // Encuadre. En pantallas anchas la imagen llena el viewport recortando lo
  // que sobra. En móvil vertical eso ampliaría tanto que se perdería casi
  // todo el contenido, así que se limita cuánto se puede recortar: la imagen
  // encoge y deja banda negra arriba y abajo, donde caen los rótulos.
  maxCrop: 0.35,       // nunca ocultar más del 35 % del ancho de la imagen

  // Dónde se coloca la imagen cuando sobra alto (pantallas verticales).
  // 0 = pegada arriba · 0.5 = centrada · 1 = pegada abajo.
  // Por debajo de 0.5 el hueco queda abajo, que es donde van los rótulos.
  alineacionVertical: 0.34,

  // Punto de interés horizontal por imagen, de 0 (izquierda) a 1 (derecha).
  // Solo se nota cuando hay recorte. Útil si el sujeto no está centrado:
  //   focus: { 3: 0.35 }  → en la imagen 3, encuadra algo a la izquierda
  focus: {},

  // El mapa de situación ocupa un paso de la secuencia, como si fuera una
  // imagen más. Aquí se dice tras cuál de las imágenes va:
  //   'fin' → el último · 0 → antes de todas · 2 → entre la 2 y la 3
  //   null  → sin mapa
  // Con 'fin' sigue quedando el último aunque cambie el número de imágenes.
  mapaDespuesDe: 0,
};

/* El mapa añade un paso extra, así que la secuencia tiene una posición más
   que imágenes. Estas dos funciones traducen entre ambas numeraciones. */
const IMAGENES = CONFIG.lastFrame - CONFIG.firstFrame + 1;
const HAY_MAPA = CONFIG.mapaDespuesDe !== null && typeof L !== 'undefined';
const MAPA_AL_FINAL = HAY_MAPA && CONFIG.mapaDespuesDe === 'fin';
const PASO_MAPA = !HAY_MAPA ? -1
  : MAPA_AL_FINAL ? IMAGENES
  : CONFIG.mapaDespuesDe;

/* Si el mapa cierra la pieza se le reservan dos posiciones en vez de una.
   El recorrido se mide entre posiciones consecutivas, así que la última no
   tiene tramo propio: sin esta segunda posición, el mapa aparecería pero la
   vía no llegaría a trazarse. */
const TOTAL = IMAGENES + (!HAY_MAPA ? 0 : MAPA_AL_FINAL ? 2 : 1);

const esPasoMapa = (paso) => HAY_MAPA
  && (paso === PASO_MAPA || (MAPA_AL_FINAL && paso === PASO_MAPA + 1));

/** Posición en la secuencia → índice de imagen (null si ese paso es el mapa) */
function imagenDe(paso) {
  if (esPasoMapa(paso)) return null;
  return paso < PASO_MAPA || PASO_MAPA < 0 ? paso : paso - 1;
}

/* ------------------------------------------------------------------ modo */

const params = new URLSearchParams(location.search);
const isEmbed = params.get('embed') === '1' || window.self !== window.top;
if (isEmbed) document.body.classList.add('is-embed');

/* ------------------------------------------------------------------ nodos */

const canvas = document.getElementById('sequence');
const ctx = canvas.getContext('2d', { alpha: false });
const loader = document.getElementById('loader');
const loaderFill = document.getElementById('loaderFill');
const progressBar = document.getElementById('progressBar');

/* Rótulos.
   Dos formas de situarlos:
     data-in / data-out → progreso 0-1 a mano
     data-img="4"       → atado a la imagen 4 (se calcula solo)
   Con data-img puedes añadir data-img-fin="6" para abarcar varias. */
/** Índice de imagen → posición en la secuencia (el mapa corre el resto) */
function pasoDe(indiceImagen) {
  if (PASO_MAPA < 0) return indiceImagen;
  return indiceImagen < PASO_MAPA ? indiceImagen : indiceImagen + 1;
}

/** Convierte un rango de pasos en un rango de progreso de scroll */
function rangoDePasos(desde, hasta) {
  const ancho = 1 / (TOTAL - 1);
  const esc = 1 - CONFIG.tailHold; // los rótulos viven en el scroll real
  return {
    in: Math.max(0, (desde * ancho - ancho * 0.25) * esc),
    // el rótulo del último paso se queda hasta el final
    out: hasta >= TOTAL - 1 ? 1 : Math.min(1, (hasta * ancho + ancho * 0.6) * esc),
  };
}

const captions = [...document.querySelectorAll('.caption')].map((el) => {
  // Atado al mapa
  if (el.dataset.mapa !== undefined && PASO_MAPA >= 0) {
    return { el, ...rangoDePasos(PASO_MAPA, MAPA_AL_FINAL ? PASO_MAPA + 1 : PASO_MAPA) };
  }
  // Atado a una imagen o a un rango de imágenes
  if (el.dataset.img) {
    const desde = pasoDe(parseInt(el.dataset.img, 10) - CONFIG.firstFrame);
    const hasta = el.dataset.imgFin
      ? pasoDe(parseInt(el.dataset.imgFin, 10) - CONFIG.firstFrame)
      : desde;
    return { el, ...rangoDePasos(desde, hasta) };
  }
  // A mano, en progreso 0-1
  return {
    el,
    in: parseFloat(el.dataset.in),
    out: parseFloat(el.dataset.out),
  };
});

/* --------------------------------------------------------------- precarga */

const frames = new Array(IMAGENES);
let loadedCount = 0;

const frameURL = (index) => {
  const n = String(CONFIG.firstFrame + index).padStart(CONFIG.padding, '0');
  return CONFIG.path.replace('{i}', n);
};

function loadFrame(index) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      // decode() evita que el primer drawImage bloquee el hilo principal
      if (img.decode) { try { await img.decode(); } catch { /* ignorado */ } }
      frames[index] = img;
      loadedCount++;
      resolve(img);
    };
    img.onerror = () => {
      console.warn('[toledo] No se pudo cargar', frameURL(index));
      loadedCount++;
      resolve(null);
    };
    img.src = frameURL(index);
  });
}

/** Precarga en orden, con un número limitado de peticiones a la vez. */
async function preload(onProgress) {
  let next = 0;
  const worker = async () => {
    while (next < IMAGENES) {
      await loadFrame(next++);
      onProgress(loadedCount / IMAGENES);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONFIG.concurrency, IMAGENES) }, worker)
  );
}

/* ----------------------------------------------------------------- canvas */

let viewW = 0;
let viewH = 0;

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // 2x ya es nítido
  const rect = canvas.getBoundingClientRect();
  viewW = rect.width;
  viewH = rect.height;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (HAY_MAPA) redimensionarMapa();
  render(true);
}

/**
 * Calcula el rectángulo donde va la imagen.
 * Llena el viewport cuando puede; si para llenarlo tuviera que ocultar más
 * del `maxCrop` del ancho (caso del móvil vertical), reduce la escala y deja
 * banda arriba y abajo en lugar de comerse la imagen.
 */
function encuadre(img, indice) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;

  const contain = Math.min(viewW / iw, viewH / ih);
  const cover = Math.max(viewW / iw, viewH / ih);
  const limite = viewW / (iw * (1 - CONFIG.maxCrop));
  const escala = Math.min(cover, Math.max(contain, limite));

  const w = iw * escala;
  const h = ih * escala;

  // Punto de interés: solo influye cuando hay algo que recortar
  const foco = CONFIG.focus[indice + CONFIG.firstFrame] ?? 0.5;
  const x = viewW > w ? (viewW - w) / 2 : -(w - viewW) * foco;

  // Cuando sobra alto, la imagen no se centra: se sube, de modo que el hueco
  // grande quede abajo y sirva de superficie para los rótulos.
  const sobra = viewH - h;
  const y = sobra > 0 ? sobra * CONFIG.alineacionVertical : sobra / 2;

  return { x, y, w, h };
}

/** Dibuja una imagen según su encuadre */
function pintar(img, indice) {
  const { x, y, w, h } = encuadre(img, indice);
  ctx.drawImage(img, x, y, w, h);
  return { y, h };
}

/** Si la imagen pedida aún no ha cargado, usa la más cercana disponible */
function nearestLoaded(index) {
  if (index === null || index < 0) return null;
  if (frames[index]) return frames[index];
  for (let d = 1; d < IMAGENES; d++) {
    if (frames[index - d]) return frames[index - d];
    if (frames[index + d]) return frames[index + d];
  }
  return null;
}

/* Suavizado del fundido: arranca y termina despacio, sin el corte lineal */
const smoothstep = (x) => x * x * (3 - 2 * x);

let lastI = -1;
let lastAlpha = -1;

/**
 * Pinta el estado actual.
 * Mantiene la imagen i estable y, en el último tramo, funde hacia la i+1.
 */
function render(force = false) {
  // La cola final no avanza la secuencia: deja la última imagen en reposo
  const avance = Math.min(currentProgress / (1 - CONFIG.tailHold), 1);
  const pos = avance * (TOTAL - 1);
  const i = Math.min(TOTAL - 2, Math.floor(pos));
  const t = TOTAL > 1 ? pos - i : 0;

  // El fundido solo ocupa la cola del tramo
  const inicioFade = 1 - CONFIG.fadeRatio;
  let alpha = t <= inicioFade ? 0 : (t - inicioFade) / CONFIG.fadeRatio;
  alpha = smoothstep(Math.min(Math.max(alpha, 0), 1));

  /* El mapa se actualiza siempre, antes de la salida rápida: durante su paso
     el canvas no cambia (mismo i, mismo alpha) pero la vía sí se va trazando,
     así que si esto fuera después, la animación se quedaría congelada. */
  if (HAY_MAPA) {
    // Suma de los dos lados del fundido: si ambas posiciones son el mapa
    // (el caso de cierre, que ocupa dos), el peso se mantiene en 1.
    const peso = (esPasoMapa(i) ? 1 - alpha : 0) + (esPasoMapa(i + 1) ? alpha : 0);
    opacidadMapa(peso);

    let avance;
    if (esPasoMapa(i)) {
      // Si lo siguiente también es mapa no hay fundido que respetar y se
      // aprovecha el tramo entero; si no, se deja libre la cola del fundido
      // para que la vía acabe de trazarse antes de empezar a desaparecer.
      avance = esPasoMapa(i + 1) ? t : Math.min(t / (1 - CONFIG.fadeRatio), 1);
    } else if (esPasoMapa(i + 1)) {
      avance = 0;                        // aún está entrando
    } else {
      avance = i > PASO_MAPA ? 1 : 0;    // ya pasó, o todavía no llega
    }
    animarMapa(avance);
  }

  // Evita repintar si nada ha cambiado de forma apreciable
  if (!force && i === lastI && Math.abs(alpha - lastAlpha) < 0.004) return;
  lastI = i;
  lastAlpha = alpha;

  // El paso del mapa no tiene imagen: su peso va al contenedor de Leaflet
  const imgActual = imagenDe(i);
  const imgSiguiente = imagenDe(i + 1);
  const actual = nearestLoaded(imgActual);
  const siguiente = nearestLoaded(imgSiguiente);

  // Las bandas deben quedar en negro, no con restos del fotograma anterior
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0a0c0e';
  ctx.fillRect(0, 0, viewW, viewH);

  let caja = null;
  if (actual) caja = pintar(actual, imgActual);

  if (alpha > 0 && siguiente && siguiente !== actual) {
    ctx.globalAlpha = alpha;
    const cajaSig = pintar(siguiente, imgSiguiente);
    ctx.globalAlpha = 1;
    if (!caja) caja = cajaSig;
  }

  if (caja) marcarBordeImagen(caja);
}

/* Publica dónde termina la imagen para que los rótulos puedan apoyarse
   justo debajo cuando hay banda negra (móvil vertical). */
const BANDA_MINIMA = 90; // por debajo de esto no cabe un rótulo: va encima
let bordeAnterior = -1;

function marcarBordeImagen({ y, h }) {
  const finImagen = Math.round(Math.min(y + h, viewH));
  if (finImagen === bordeAnterior) return;
  bordeAnterior = finImagen;

  const raiz = document.documentElement.style;
  raiz.setProperty('--img-fin', `${Math.max(finImagen, 0)}px`);
  raiz.setProperty('--banda-inferior', `${Math.max(viewH - finImagen, 0)}px`);
  document.body.classList.toggle('tiene-banda', viewH - finImagen >= BANDA_MINIMA);
}

/* ---------------------------------------------------------------- progreso */

let targetProgress = 0;
let currentProgress = 0;
let rafId = null;

function setProgress(p) {
  targetProgress = Math.min(Math.max(p, 0), 1);
  if (rafId === null) rafId = requestAnimationFrame(tick);
}

function tick() {
  const delta = targetProgress - currentProgress;

  if (Math.abs(delta) < 0.0002) {
    currentProgress = targetProgress;
    rafId = null;
  } else {
    currentProgress += delta * CONFIG.smoothing;
    rafId = requestAnimationFrame(tick);
  }

  render();
  updateOverlays(currentProgress);
}

function updateOverlays(p) {
  if (progressBar) progressBar.style.width = `${p * 100}%`;
  for (const c of captions) {
    c.el.classList.toggle('is-visible', p >= c.in && p <= c.out);
  }
}

/* ------------------------------------------------------- fuentes de scroll */

function initStandaloneScroll() {
  gsap.registerPlugin(ScrollTrigger);

  // Lenis aporta la inercia; ScrollTrigger solo lee la posición.
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
  window.__lenis = lenis; // para depurar: __lenis.scrollTo(px) en la consola
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  ScrollTrigger.create({
    trigger: '#scrollTrack',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => setProgress(self.progress),
  });
}

function initEmbedScroll() {
  // El artículo contenedor manda el progreso. Ver embed/embed.js
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data && data.type === 'toledo:progress' && typeof data.progress === 'number') {
      setProgress(data.progress);
    }
  });
  // Avisa al padre de que ya puede empezar a enviar progreso
  window.parent.postMessage({ type: 'toledo:ready' }, '*');
}

/* -------------------------------------------------------------------- init */

async function init() {
  if (HAY_MAPA) {
    crearMapa();
    opacidadMapa(0);
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    loader.classList.add('is-hidden');
    resizeCanvas();
    if (isEmbed) initEmbedScroll();
    else initStandaloneScroll();
    setProgress(0);
  };

  await preload((ratio) => {
    loaderFill.style.width = `${ratio * 100}%`;
    if (ratio >= CONFIG.readyThreshold) start();
  });

  start(); // red de seguridad por si el umbral no llegó a cumplirse
}

init();
