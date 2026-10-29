/* =========================================================================
   mapa.js — mapa de situación del accidente
   -------------------------------------------------------------------------
   Base cartográfica de OpenStreetMap, sin clave de API. El aspecto monocromo
   oscuro lo da un filtro CSS sobre la capa de teselas, no el proveedor.
   Marcadores vectoriales, así que no hay iconos que cargar.

   Al avanzar el scroll se traza la línea de alta velocidad de norte a sur y,
   al final, aparece el punto del accidente.

   El mapa no se puede arrastrar ni hacer zoom a propósito: dentro de una
   pieza de scroll, un mapa interactivo se quedaría con el scroll del lector.
   ========================================================================= */

const LUGAR = { nombre: 'Lugar del accidente', lat: 39.433801624805895, lon: -3.8161196541920765 };

/* `rotular: false` en las capitales porque el mapa base ya las nombra: poner
   encima nuestra propia etiqueta duplicaba el topónimo. El punto blanco sigue
   marcándolas. Los núcleos pequeños sí llevan etiqueta propia, porque a este
   nivel de zoom el mapa base no los rotula. */
const CIUDADES = [
  { nombre: 'Madrid',       lat: 40.416782,  lon: -3.703507,  grande: true, rotular: false },
  { nombre: 'Toledo',       lat: 39.8558913, lon: -4.024265,  grande: true, rotular: false },
  { nombre: 'Ciudad Real',  lat: 38.9854201, lon: -3.9285138, grande: true, rotular: false },
  { nombre: 'Los Yébenes',  lat: 39.5823444, lon: -3.8702361, rotular: true },
  { nombre: 'Urda',         lat: 39.3675974, lon: -3.7313689, rotular: true },
];

const VERDE = '#01f3b3';

let mapa = null;

function crearMapa() {
  const nodo = document.getElementById('mapa');
  if (!nodo || typeof L === 'undefined') return null;

  mapa = L.map(nodo, {
    zoomControl: false,
    attributionControl: true,
    scrollWheelZoom: false,   // si no, el mapa se quedaría el scroll de la pieza
    dragging: false,
    touchZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    zoomSnap: 0,              // zoom fraccionario: permite acercarse sin saltos
  });

  // Teselas oficiales de OpenStreetMap: no piden clave de API.
  // El aspecto monocromo oscuro lo da un filtro CSS sobre la capa de teselas
  // (ver .leaflet-tile-pane en css/style.css), no el proveedor.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(mapa);

  // Capas propias, para poder animar cada una por separado.
  // La vía va por debajo de los marcadores (overlayPane está en 400).
  mapa.createPane('via');
  mapa.getPane('via').style.zIndex = 350;

  mapa.createPane('accidente');
  mapa.getPane('accidente').style.zIndex = 450;

  cargarVia();

  // Ciudades de referencia
  for (const c of CIUDADES) {
    // Relleno oscuro con aro claro, para que se separe del gris del mapa.
    // El radio se mantiene contenido porque el mapa base rotula la ciudad
    // justo en esta coordenada y un punto mayor se comería el topónimo.
    L.circleMarker([c.lat, c.lon], c.grande ? {
      radius: 3.5,
      color: '#ffffff',
      weight: 1.5,
      fillColor: '#1f2327',
      fillOpacity: 1,
      interactive: false,
    } : {
      radius: 3,
      color: 'rgba(10,12,14,0.8)',
      weight: 1.5,
      fillColor: '#1f2327',
      fillOpacity: 0.75,
      interactive: false,
    }).addTo(mapa);

    if (c.rotular) {
      L.marker([c.lat, c.lon], {
        interactive: false,
        icon: L.divIcon({
          className: 'etiqueta' + (c.grande ? ' etiqueta--grande' : ''),
          html: `<span>${c.nombre}</span>`,
          iconSize: null,
        }),
      }).addTo(mapa);
    }
  }

  // Punto del accidente: halo + punto, en su propia capa para poder
  // hacerlo aparecer una vez trazada la vía
  L.circleMarker([LUGAR.lat, LUGAR.lon], {
    pane: 'accidente',
    radius: 16, color: VERDE, weight: 1.5, opacity: 0.7,
    fillColor: VERDE, fillOpacity: 0.22, interactive: false,
  }).addTo(mapa);

  // Relleno oscuro con aro verde: en verde sólido se confundiría con la vía,
  // que pasa justo por este punto, y en blanco con el mapa claro.
  L.circleMarker([LUGAR.lat, LUGAR.lon], {
    pane: 'accidente',
    radius: 6, color: VERDE, weight: 3,
    fillColor: '#0a0c0e', fillOpacity: 1, interactive: false,
  }).addTo(mapa);

  L.marker([LUGAR.lat, LUGAR.lon], {
    pane: 'accidente',
    interactive: false,
    icon: L.divIcon({
      className: 'etiqueta etiqueta--accidente',
      html: `<span>${LUGAR.nombre}</span>`,
      iconSize: null,
    }),
  }).addTo(mapa);

  animarMapa(0);

  encuadrarMapa();
  return mapa;
}

/**
 * Línea de alta velocidad Madrid–Sevilla (datos de ADIF).
 * Se dibuja en dos pasadas: un trazo oscuro ancho por debajo que la despega
 * del mapa, y encima la línea en verde de marca.
 */
let lineasVia = [];      // tramos en [lat, lon]
let latNorte = 0;
let latSur = 0;
let capaVia = null;      // trazo verde
let capaViaHalo = null;  // trazo oscuro por debajo
let ultimoCorte = null;

function cargarVia() {
  fetch('data/via-ave.geojson')
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((geo) => {
      if (!mapa) return;

      // GeoJSON viene en [lon, lat]; Leaflet quiere [lat, lon]
      lineasVia = geo.features[0].geometry.coordinates
        .map((linea) => linea.map(([lon, lat]) => [lat, lon]));

      const lats = lineasVia.flat().map((p) => p[0]);
      latNorte = Math.max(...lats);
      latSur = Math.min(...lats);

      const comun = { pane: 'via', interactive: false, lineJoin: 'round' };
      capaViaHalo = L.polyline([], { ...comun, color: '#494949', weight: 5, opacity: 0.8 }).addTo(mapa);
      capaVia = L.polyline([], { ...comun, color: VERDE, weight: 2, opacity: 0.95 }).addTo(mapa);

      ultimoCorte = null;
      animarMapa(avanceActual);  // por si el scroll ya iba avanzado
    })
    .catch((e) => console.warn('[toledo] No se pudo cargar la vía:', e));
}

/**
 * Devuelve los tramos de la vía que quedan al norte de `latCorte`,
 * interpolando el punto exacto donde cada tramo cruza esa latitud.
 */
function recortarPorLatitud(latCorte) {
  const salida = [];
  for (const linea of lineasVia) {
    let actual = [];
    for (let i = 0; i < linea.length; i++) {
      const p = linea[i];
      const dentro = p[0] >= latCorte;

      if (dentro) {
        if (!actual.length && i > 0) {
          // entra: añade primero el cruce con la latitud de corte
          actual.push(interpolar(linea[i - 1], p, latCorte));
        }
        actual.push(p);
      } else if (actual.length) {
        // sale: cierra el tramo en el punto de cruce
        actual.push(interpolar(linea[i - 1], p, latCorte));
        salida.push(actual);
        actual = [];
      }
    }
    if (actual.length > 1) salida.push(actual);
  }
  return salida;
}

function interpolar(a, b, lat) {
  const t = (lat - a[0]) / (b[0] - a[0]);
  return [lat, a[1] + (b[1] - a[1]) * t];
}

/** Redibuja la vía trazada hasta `avance` (0 = nada, 1 = completa) */
function dibujarViaHasta(avance) {
  if (!capaVia || !lineasVia.length) return;

  const latCorte = latNorte - avance * (latNorte - latSur);

  // Redibujar en cada fotograma sería tirar trabajo: solo cuando el corte
  // se mueve lo bastante como para notarse.
  const paso = (latNorte - latSur) / 160;
  if (ultimoCorte !== null && Math.abs(latCorte - ultimoCorte) < paso
      && avance > 0.001 && avance < 0.999) return;
  ultimoCorte = latCorte;

  const tramos = avance >= 0.999 ? lineasVia
               : avance <= 0.001 ? []
               : recortarPorLatitud(latCorte);

  capaVia.setLatLngs(tramos);
  capaViaHalo.setLatLngs(tramos);
}

/* Dos encuadres entre los que se navega al avanzar el scroll:
   el general, con las capitales de referencia, y el de la zona del suceso. */
let vistaLejos = null;
let vistaCerca = null;

const MARGEN = [40, 120];

function calcularVistas() {
  if (!mapa) return;

  const generales = L.latLngBounds([
    [LUGAR.lat, LUGAR.lon], ...CIUDADES.map((c) => [c.lat, c.lon]),
  ]);

  /* Zona del suceso. El encuadre se ancla al sur del punto para que el lugar
     del accidente quede en la franja alta de la pantalla, despejado del
     rótulo, que ocupa la parte baja. */
  const cercanas = L.latLngBounds([
    [LUGAR.lat - 0.30, LUGAR.lon - 0.13],
    [LUGAR.lat + 0.07, LUGAR.lon + 0.13],
  ]);

  const margen = L.point(MARGEN[0], MARGEN[1]);
  vistaLejos = { centro: generales.getCenter(), zoom: mapa.getBoundsZoom(generales, false, margen) };
  vistaCerca = { centro: cercanas.getCenter(), zoom: mapa.getBoundsZoom(cercanas, false, margen) };
}

const entre = (a, b, t) => a + (b - a) * t;
let ultimoZoom = null;

/** Sitúa la vista entre el encuadre general (0) y el de la zona (1) */
function encuadrarMapa(acercamiento = 0) {
  if (!mapa) return;
  if (!vistaLejos) calcularVistas();
  if (!vistaLejos) return;

  const zoom = entre(vistaLejos.zoom, vistaCerca.zoom, acercamiento);

  // Reencuadrar en cada fotograma no aporta nada y obliga a recargar teselas
  if (ultimoZoom !== null && Math.abs(zoom - ultimoZoom) < 0.01
      && acercamiento > 0.001 && acercamiento < 0.999) return;
  ultimoZoom = zoom;

  mapa.setView([
    entre(vistaLejos.centro.lat, vistaCerca.centro.lat, acercamiento),
    entre(vistaLejos.centro.lng, vistaCerca.centro.lng, acercamiento),
  ], zoom, { animate: false });
}

/** Leaflet necesita que le avisen cuando cambia el tamaño del contenedor */
function redimensionarMapa() {
  if (!mapa) return;
  mapa.invalidateSize({ animate: false });
  calcularVistas();
  ultimoZoom = null;
  animarMapa(avanceActual);
}

/* -------------------------------------------------------------- animación */

/* Reparto del recorrido del mapa, que ocupa dos posiciones de la secuencia
   y sostiene dos rótulos seguidos:
     0,00 – 0,38   se traza la vía de norte a sur      (primer rótulo)
     0,33 – 0,46   aparece el punto del accidente
     0,52 – 0,88   se acerca a la zona del suceso      (segundo rótulo)
     0,88 – 1,00   reposo antes de pasar a la imagen            */
const FIN_TRAZADO = 0.38;
const INICIO_PUNTO = 0.33;
const INICIO_ZOOM = 0.52;
const FIN_ZOOM = 0.88;

const suave = (x) => x * x * (3 - 2 * x);
const tramo = (v, a, b) => Math.min(Math.max((v - a) / (b - a), 0), 1);

/**
 * Avance interno del paso del mapa, de 0 a 1.
 *
 * El trazado se consigue recortando el panel de la vía con clip-path, no
 * redibujando la geometría: el mapa está fijo, así que un recorte en
 * píxeles basta y no cuesta nada por fotograma.
 */
let avanceActual = 0;

function animarMapa(avance) {
  if (!mapa) return;
  avanceActual = avance;

  dibujarViaHasta(suave(tramo(avance, 0, FIN_TRAZADO)));
  encuadrarMapa(suave(tramo(avance, INICIO_ZOOM, FIN_ZOOM)));

  const paneAcc = mapa.getPane('accidente');
  if (!paneAcc) return;
  // Solo opacidad: un transform sobre el panel movería el marcador
  // respecto a sus coordenadas reales.
  paneAcc.style.opacity = suave(tramo(avance, INICIO_PUNTO, 1));
}

/** Lo llama main.js en cada repintado con el peso que le toca (0-1) */
function opacidadMapa(valor) {
  const nodo = document.getElementById('mapa');
  if (!nodo) return;
  nodo.style.opacity = valor;
  nodo.style.visibility = valor > 0.001 ? 'visible' : 'hidden';
}
