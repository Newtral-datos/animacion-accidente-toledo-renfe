#!/bin/bash
# =============================================================================
# preparar-frames.sh — deja las imágenes listas para la animación
#
#   Acepta un vídeo o una carpeta de imágenes, las escala, las convierte a
#   WebP, las renumera correlativamente en frames/ y actualiza la configuración
#   de js/main.js para que apunte a ellas.
#
#   Uso:
#     ./tools/preparar-frames.sh origen.mp4
#     ./tools/preparar-frames.sh ~/Descargas/render/
#
#   Opciones:
#     --ancho N      ancho máximo en píxeles      (por defecto 2560, nunca amplía)
#     --calidad N    calidad WebP 0-100           (por defecto 78)
#     --fps N        solo para vídeo              (por defecto 30)
#     --proporcion N relación de aspecto de salida (por defecto 1.7778 = 16:9)
#     --invertir     invierte el orden de las imágenes de entrada
# =============================================================================

set -euo pipefail

ANCHO=2560
CALIDAD=78
FPS=30
PROPORCION=1.7778   # 16:9
INVERTIR=""
ORIGEN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ancho)   ANCHO="$2";   shift 2 ;;
    --calidad) CALIDAD="$2"; shift 2 ;;
    --fps)     FPS="$2";     shift 2 ;;
    --proporcion) PROPORCION="$2"; shift 2 ;;
    --invertir)   INVERTIR="invertir"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *)         ORIGEN="$1";  shift ;;
  esac
done

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="$RAIZ/frames"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT

if [[ -z "$ORIGEN" ]]; then
  echo "Falta el origen. Pasa un vídeo o una carpeta de imágenes."
  echo "Ejemplo: ./tools/preparar-frames.sh render.mp4"
  exit 1
fi

if [[ ! -e "$ORIGEN" ]]; then
  echo "No existe: $ORIGEN"
  exit 1
fi

command -v cwebp >/dev/null || { echo "Falta cwebp. Instálalo con: brew install webp"; exit 1; }

# --- 1. Reunir las imágenes de partida en $TEMP ------------------------------

CRUDO="$TEMP/crudo"
mkdir -p "$CRUDO"

if [[ -d "$ORIGEN" ]]; then
  echo "Origen: carpeta de imágenes"
  cp "$ORIGEN"/* "$CRUDO/" 2>/dev/null || true
else
  echo "Origen: vídeo (extrayendo a $FPS fps)"
  command -v ffmpeg >/dev/null || { echo "Falta ffmpeg"; exit 1; }
  ffmpeg -hide_banner -loglevel error -i "$ORIGEN" \
         -vf "fps=$FPS" "$CRUDO/src_%05d.png"
fi

# Recorta franjas lisas de los bordes y deja todas a la misma proporción,
# para que el encuadre no salte entre una imagen y la siguiente.
echo "Normalizando (proporción $PROPORCION, ancho máx ${ANCHO}px)…"
python3 "$RAIZ/tools/normalizar.py" "$CRUDO" "$TEMP" "$PROPORCION" "$ANCHO" $INVERTIR \
  || { echo "Falló la normalización"; exit 1; }

# --- 2. Apartar los frames anteriores ----------------------------------------

if [[ -d "$DESTINO" ]] && [[ -n "$(ls -A "$DESTINO" 2>/dev/null)" ]]; then
  ANTERIOR="$RAIZ/.frames-anteriores-$(date +%Y%m%d-%H%M%S)"
  mv "$DESTINO" "$ANTERIOR"
  echo "Frames anteriores guardados en $(basename "$ANTERIOR")"
fi
mkdir -p "$DESTINO"

# --- 3. Escalar y convertir a WebP -------------------------------------------

echo "Convirtiendo a WebP (calidad $CALIDAD)…"
i=0
total=$(find "$TEMP" -maxdepth 1 -name 'norm_*' | wc -l | tr -d ' ')
for archivo in "$TEMP"/norm_*; do
  i=$((i + 1))
  salida="$(printf '%s/img_%03d.webp' "$DESTINO" "$i")"
  cwebp -quiet -q "$CALIDAD" "$archivo" -o "$salida"
  printf '\r  %d/%d' "$i" "$total"
done
echo ""

# --- 4. Actualizar js/main.js ------------------------------------------------

MAIN="$RAIZ/js/main.js"
if [[ -f "$MAIN" ]]; then
  # BSD sed (macOS) necesita el argumento vacío tras -i
  sed -i '' \
    -e "s|^\( *path: *\).*|\1'frames/img_{i}.webp',|" \
    -e "s|^\( *lastFrame: *\).*|\1$i,|" \
    -e "s|^\( *padding: *\).*|\13,          // img_001 → 3 dígitos|" \
    "$MAIN"
  echo "js/main.js actualizado: $i frames, formato WebP"
fi

# --- 5. Resumen --------------------------------------------------------------

peso=$(du -sh "$DESTINO" | cut -f1)
echo ""
echo "Listo. $i frames en frames/ — $peso en total"
if [[ "$(du -sk "$DESTINO" | cut -f1)" -gt 5120 ]]; then
  echo "Aviso: supera los 5 MB recomendados. Prueba con --calidad 70 o --ancho 1600."
fi
if [[ $i -lt 8 ]]; then
  echo "Aviso: solo $i imágenes. Por debajo de 8 el fundido se nota mucho;"
  echo "       sube fadeRatio en js/main.js hacia 0.7 para suavizarlo."
fi
echo "Arranca con: python3 -m http.server 8765"
