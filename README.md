# Animación accidente Toledo — Newtral

Secuencia de imágenes controlada por scroll, con fundido cruzado entre ellas.
Pensada para 15-20 imágenes y para embeberse en un artículo mediante iframe.

## Arrancar

```bash
python3 -m http.server 8765
```

- Animación sola: http://127.0.0.1:8765/index.html
- Artículo de ejemplo con el embed: http://127.0.0.1:8765/embed/articulo-ejemplo.html

No hay paso de compilación. GSAP y Lenis se cargan por CDN.

## Estructura

```
index.html                   la pieza (canvas, marca y rótulos)
css/style.css                identidad Newtral
js/main.js                   precarga, render con fundido y scrub
frames/                      img_001.webp … (ahora: 2 imágenes reales)
imagenes-creadas/            originales sin procesar
img/                         logo y favicon
embed/embed.js               va en el ARTÍCULO, manda el progreso al iframe
embed/articulo-ejemplo.html  ejemplo de integración
tools/preparar-frames.sh     deja las imágenes listas (escala, WebP, renumera)
tools/normalizar.py          recorta franjas y unifica proporción
tools/test-movil.html        previsualización en varios tamaños de pantalla
```

## Cómo funciona

Un `<canvas>` fijo a pantalla completa. Las imágenes se precargan en memoria y
el progreso de scroll (0-1) se reparte entre ellas. Cada imagen se mantiene
estable durante su tramo y **funde sobre la siguiente** en la cola del tramo.
Con pocas imágenes esto es imprescindible: sin fundido se verían cortes secos.

El reparto lo controla `fadeRatio` en `js/main.js`:

```
imagen 4 ────────────── estable ──────────┬── fundido ──┐ imagen 5
                         55 %             │     45 %    │
```

- `fadeRatio: 0.3` (actual, ajustado a las 2 imágenes de ahora)
- más bajo (0.2) — cada imagen se lee bien, transición más marcada
- más alto (0.7) — flujo casi continuo, se parece más a un vídeo

Con 15-20 imágenes, súbelo de vuelta a `0.45`.

Además, `tailHold` (0.12) reserva el tramo final del scroll sin cambio alguno:
la última imagen se queda quieta para poder leerla antes de salir de la pieza.
Sin esto, la última imagen solo quedaría limpia en el píxel final del scroll.

Dos modos, detectados automáticamente:

| Modo | Cuándo | Fuente del progreso |
|---|---|---|
| standalone | se abre `index.html` directamente | ScrollTrigger sobre `.scroll-track` |
| embed | dentro de un iframe, o con `?embed=1` | `postMessage` desde el artículo |

En modo embed **el iframe no scrollea por dentro**. El artículo tiene un
contenedor alto, el iframe va `sticky` a `100vh` dentro de él, y `embed.js`
calcula el progreso y se lo manda. Así se evita el scroll anidado, que en
móvil se comporta mal.

## Responsive

El encuadre se adapta solo a la forma de la pantalla, porque una imagen 16:9 a
pantalla completa en un móvil vertical se ampliaría casi 4x y dejaría fuera el
75 % del contenido (los trenes de los extremos desaparecerían).

| Pantalla | Comportamiento |
|---|---|
| escritorio y móvil horizontal | la imagen llena el viewport, recortando lo que sobra |
| móvil y tablet verticales | la imagen encoge hasta mostrarse casi entera, con banda negra; los rótulos caen debajo, sobre el negro |

Lo gobiernan dos parámetros de `js/main.js`:

- `maxCrop: 0.35` — nunca se oculta más del 35 % del ancho de la imagen. Si
  para llenar la pantalla hiciera falta recortar más, la imagen encoge.
- `alineacionVertical: 0.34` — cuando sobra alto, la imagen se sitúa algo por
  encima del centro, de modo que el hueco grande quede abajo para el texto.

Los rótulos se anclan al borde inferior real de la imagen (`--img-fin`, que
calcula el JS en cada repintado), así que nunca la invaden ni se salen de
pantalla, sea cual sea el alto del texto.

### Punto de interés

Cuando hay recorte, por defecto se encuadra el centro. Si en alguna imagen el
sujeto está descentrado y se pierde, se indica en `CONFIG.focus`:

```js
focus: { 3: 0.35 },   // en la imagen 3, encuadrar hacia la izquierda
```

0 es el borde izquierdo, 1 el derecho, 0.5 el centro.

### Probar tamaños

```
http://127.0.0.1:8765/tools/test-movil.html
```

Muestra la pieza a la vez en iPhone 14, iPhone SE, móvil horizontal y iPad.
Desde la consola, `enviar(0.5)` mueve las cuatro maquetas al mismo punto.

## Identidad

Verde de marca `#01f3b3`, gris secundario `#494949`, fondo `#0a0c0e`.
Todo centralizado en variables al principio de `css/style.css`.

El logo original es negro y no se vería sobre el fondo oscuro, así que hay una
versión preparada:

- `img/logo-newtral.png` — original, tal cual
- `img/logo-newtral-blanco.png` — wordmark en blanco, checks en verde de marca
- `img/favicon.png` / `favicon-64.png` — los dos checks sobre fondo negro

**Tipografía**: la pieza usa la pila del sistema. Si Newtral tiene fuente
corporativa, se cambia en un solo sitio, la variable `--tipo` de `css/style.css`.

## Rótulos

Van en `index.html`. Se pueden situar de dos maneras:

```html
<!-- atado a una imagen concreta -->
<p class="caption" data-img="7">Texto…</p>

<!-- abarcando un rango de imágenes -->
<p class="caption" data-img="7" data-img-fin="9">Texto…</p>

<!-- o a mano, en progreso 0-1 -->
<p class="caption" data-in="0.32" data-out="0.52">Texto…</p>
```

`data-img` es lo más cómodo: si cambia el número de imágenes, los rótulos se
recolocan solos. Dentro del texto, `<b>` destaca un dato en verde.

## Añadir el resto de imágenes

Ahora hay **2 imágenes reales** (Iryo y AVE), procesadas desde
`imagenes-creadas/`. Esa carpeta es el origen: las de `frames/` son las
derivadas que consume la animación. Para añadir el resto:

```bash
./tools/preparar-frames.sh ~/ruta/a/tus/imagenes/
./tools/preparar-frames.sh render.mp4            # también acepta vídeo
```

El script escala, convierte a WebP, renumera correlativamente en `frames/` y
actualiza `CONFIG` en `js/main.js` (`path`, `lastFrame`, `padding`). Las
imágenes anteriores no se borran: se apartan a `.frames-anteriores-<fecha>/`.

Opciones: `--ancho 1920` · `--calidad 78` · `--fps 30` (solo vídeo).

**Importante**: el orden alfabético del nombre de archivo es el orden de la
animación. Numéralas con ceros delante (`01`, `02`… o `001`, `002`…) para que
la 10 no acabe antes que la 2.

### A mano

Déjalas en `frames/` con numeración correlativa y ajusta `CONFIG`:

```js
path: 'frames/img_{i}.webp',
firstFrame: 1,
lastFrame: 18,
padding: 3,
```

### Recomendaciones

- **Resolución**: 1920px de ancho. Con solo 15-20 imágenes el peso no es
  problema, así que conviene que se vean nítidas.
- **Formato**: WebP a calidad 78.
- **Proporción**: se dibujan en modo *cover* (rellenan la pantalla recortando
  lo que sobra). Deja aire en los bordes y no pongas nada importante en el
  margen inferior, donde van los rótulos.
- **Peso**: con 18 imágenes a 1920px rondarás 1-3 MB en total, muy holgado.
- **Bordes lisos**: las dos primeras traían una franja uniforme en el lateral
  derecho (352px) que hubo que recortar. Si el generador las sigue dando así,
  avísame y lo añado al script de preparación.

Nota: `ffmpeg` está compilado **sin `libwebp`** y no puede exportar WebP
directamente. Por eso el script usa `cwebp` (de `brew install webp`), que sí
está instalado.

## Integrar en el CMS

```html
<div class="toledo-scroller" data-toledo-scroller>
  <iframe src="RUTA/index.html?embed=1" title="Reconstrucción del accidente" loading="lazy"></iframe>
</div>

<style>
.toledo-scroller { position: relative; height: 600vh; background: #0a0c0e; }
.toledo-scroller iframe { position: sticky; top: 0; width: 100%; height: 100vh; border: 0; display: block; }
</style>

<script src="RUTA/embed/embed.js"></script>
```

La **altura del contenedor** (`600vh`) controla la velocidad: más alto =
animación más lenta. Con 15-20 imágenes, 600vh da un ritmo cómodo de lectura.

Si publicas la animación en otro dominio, cambia `TARGET_ORIGIN` en
`embed/embed.js` por ese origen exacto en lugar de `'*'`.

## Parámetros en `js/main.js`

| Parámetro | Qué hace |
|---|---|
| `fadeRatio` | duración del fundido dentro del tramo de cada imagen |
| `tailHold` | cola final de scroll en reposo sobre la última imagen |
| `smoothing` | inercia del scrub. `0.14` suave; `0.3` más directo |
| `readyThreshold` | fracción cargada antes de arrancar. En `1` con pocas imágenes |
| `concurrency` | descargas simultáneas en la precarga |
| `maxCrop` | recorte máximo del ancho antes de encoger la imagen |
| `alineacionVertical` | posición de la imagen cuando sobra alto |
| `focus` | punto de interés horizontal por imagen |

Para depurar en modo standalone, Lenis queda expuesto como `window.__lenis`
(el `window.scrollTo` normal no funciona bien con el scroll suave activo).

## Limpieza antes de publicar

- La barra de progreso inferior (`.progress` en `index.html`) es una ayuda de
  desarrollo. Bórrala si no la quieres en la versión final.
