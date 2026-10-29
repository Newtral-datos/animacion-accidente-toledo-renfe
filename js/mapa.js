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
    // Las capitales van con anillo hueco: un punto relleno taparía el
    // topónimo que ya dibuja el mapa base justo en esa coordenada.
    L.circleMarker([c.lat, c.lon], c.grande ? {
      radius: 7,
      color: 'rgba(255,255,255,0.75)',
      weight: 1.5,
      fill: false,
      interactive: false,
    } : {
      radius: 3,
      color: 'rgba(255,255,255,0.85)',
      weight: 1.5,
      fillColor: '#ffffff',
      fillOpacity: 0.6,
      interactive: false,
    }).addTo(mapa);

    if (c.rotular) {
      L.marker([c.lat, c.lon], {
        interactive: false,
        icon: L.divIcon({
          className: 'etiqueta' + (c.grande ? ' etiqueta--grande' : ''),
          html: c.nombre,
          iconSize: null,
        }),
      }).addTo(mapa);
    }
  }

  // Punto del accidente: halo + punto, en su propia capa para poder
  // hacerlo aparecer una vez trazada la vía
  L.circleMarker([LUGAR.lat, LUGAR.lon], {
    pane: 'accidente',
    radius: 16, color: VERDE, weight: 1, opacity: 0.35,
    fillColor: VERDE, fillOpacity: 0.12, interactive: false,
  }).addTo(mapa);

  // Relleno blanco con aro verde: en verde sólido se confundiría con la vía,
  // que pasa justo por este punto.
  L.circleMarker([LUGAR.lat, LUGAR.lon], {
    pane: 'accidente',
    radius: 6, color: VERDE, weight: 3,
    fillColor: '#ffffff', fillOpacity: 1, interactive: false,
  }).addTo(mapa);

  L.marker([LUGAR.lat, LUGAR.lon], {
    pane: 'accidente',
    interactive: false,
    icon: L.divIcon({
      className: 'etiqueta etiqueta--accidente',
      html: LUGAR.nombre,
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
      capaViaHalo = L.polyline([], { ...comun, color: '#0a0c0e', weight: 5, opacity: 0.55 }).addTo(mapa);
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

/** Ajusta la vista para que entren todos los puntos, con aire alrededor */
function encuadrarMapa() {
  if (!mapa) return;
  const puntos = [[LUGAR.lat, LUGAR.lon], ...CIUDADES.map((c) => [c.lat, c.lon])];
  // Más margen abajo: ahí caen los rótulos
  mapa.fitBounds(L.latLngBounds(puntos), {
    paddingTopLeft: [40, 70],
    paddingBottomRight: [40, 150],
    animate: false,
  });
}

/** Leaflet necesita que le avisen cuando cambia el tamaño del contenedor */
function redimensionarMapa() {
  if (!mapa) return;
  mapa.invalidateSize({ animate: false });
  encuadrarMapa();
}

/* -------------------------------------------------------------- animación */

/* Reparto del paso del mapa: primero se traza la vía de norte a sur y,
   solapando un poco al final, aparece el punto del accidente. */
const FIN_TRAZADO = 0.78;
const INICIO_PUNTO = 0.70;

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
