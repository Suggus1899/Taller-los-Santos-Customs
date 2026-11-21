/**
 * Script síncrono del <head>: marca que hay JavaScript ANTES del primer pintado.
 * Sin esto, el menú móvil (visible sin JS) se pliega después de pintar y desplaza
 * toda la página hacia arriba (CLS). Es un archivo propio porque la CSP no permite
 * scripts inline.
 */
document.documentElement.classList.add('js');
