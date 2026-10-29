#!/usr/bin/env python3
"""
normalizar.py — prepara las imágenes de origen para la animación.

Dos cosas, por imagen:
  1. Recorta las franjas lisas de los bordes (el generador a veces deja
     márgenes uniformes que en pantalla se ven como una banda de color).
  2. Recorta al centro a una proporción común, para que todas encuadren
     igual y el fundido no produzca un salto de escala.

Uso:  normalizar.py <origen> <destino> [proporción] [ancho máximo] [invertir]
      normalizar.py imagenes-creadas/ /tmp/salida 1.7778 2560 invertir

El ancho máximo nunca amplía: si la imagen es más pequeña se deja tal cual,
porque ampliar solo añade blandura sin aportar detalle.
"""

import os
import sys
from PIL import Image, ImageStat

UMBRAL = 6          # desviación típica por debajo de la cual la línea es lisa
MAX_RECORTE = 0.30  # nunca comer más de este porcentaje de un lado


def borde_util(im):
    """Devuelve (izq, arr, der, aba) saltándose las franjas uniformes."""
    w, h = im.size
    lim_x, lim_y = int(w * MAX_RECORTE), int(h * MAX_RECORTE)

    def liso(caja):
        return sum(ImageStat.Stat(im.crop(caja)).stddev) / 3 <= UMBRAL

    izq = 0
    while izq < lim_x and liso((izq, 0, izq + 1, h)):
        izq += 1
    der = w
    while der > w - lim_x and liso((der - 1, 0, der, h)):
        der -= 1
    arr = 0
    while arr < lim_y and liso((0, arr, w, arr + 1)):
        arr += 1
    aba = h
    while aba > h - lim_y and liso((0, aba - 1, w, aba)):
        aba -= 1

    return izq, arr, der, aba


def recorte_centrado(im, proporcion):
    """Recorta al centro para dejar la imagen en la proporción pedida."""
    w, h = im.size
    if w / h > proporcion:
        nw = int(h * proporcion)
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = int(w / proporcion)
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1

    origen, destino = sys.argv[1], sys.argv[2]
    proporcion = float(sys.argv[3]) if len(sys.argv) > 3 else 16 / 9
    ancho_max = int(sys.argv[4]) if len(sys.argv) > 4 else 0
    invertir = len(sys.argv) > 5 and sys.argv[5] == 'invertir'
    os.makedirs(destino, exist_ok=True)

    # No se filtra por extensión: hay formatos que llegan con nombres raros
    # (.jfif es JPEG, por ejemplo). Se intenta abrir cada archivo y se
    # descarta lo que no sea una imagen, incluido .DS_Store y compañía.
    candidatos = sorted(f for f in os.listdir(origen) if not f.startswith('.'))
    archivos = []
    for nombre in candidatos:
        ruta = os.path.join(origen, nombre)
        if not os.path.isfile(ruta):
            continue
        try:
            with Image.open(ruta) as prueba:
                prueba.verify()
            archivos.append(nombre)
        except Exception:
            print(f'  (se ignora {nombre}: no es una imagen legible)')

    if not archivos:
        print(f'No se han encontrado imágenes en {origen}')
        return 1

    # Algunas exportaciones por capas numeran al revés de lo que cuenta la
    # secuencia (p. ej. "..._0000_06" primero y "..._0005_01" último).
    if invertir:
        archivos.reverse()
        print('  (orden invertido)')

    for n, nombre in enumerate(archivos, 1):
        im = Image.open(os.path.join(origen, nombre)).convert('RGB')
        antes = im.size
        izq, arr, der, aba = borde_util(im)
        if (izq, arr, der, aba) != (0, 0, im.size[0], im.size[1]):
            im = im.crop((izq, arr, der, aba))
        im = recorte_centrado(im, proporcion)

        # Reducir si procede. Nunca ampliar: no añadiría detalle, solo blandura.
        nota = ''
        if ancho_max and im.size[0] > ancho_max:
            nuevo = (ancho_max, round(ancho_max / proporcion))
            im = im.resize(nuevo, Image.LANCZOS)
        elif ancho_max and im.size[0] < ancho_max:
            nota = '  (ya por debajo del ancho pedido, sin ampliar)'

        salida = os.path.join(destino, f'norm_{n:03d}.png')
        im.save(salida)
        franjas = f'  (franjas: {izq}/{arr}/{antes[0]-der}/{antes[1]-aba})' \
                  if (izq or arr or antes[0] - der or antes[1] - aba) else ''
        print(f'  {nombre}: {antes[0]}x{antes[1]} → {im.size[0]}x{im.size[1]}{franjas}{nota}')

    print(f'Normalizadas {len(archivos)} imágenes a proporción {proporcion:.4f}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
