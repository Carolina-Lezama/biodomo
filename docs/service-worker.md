# Service Worker de BioDomo

> BioDomo también está preparado para instalarse como una aplicación web
> progresiva (PWA). Consulta el [manifest de la aplicación](../manifest.webmanifest)
> y los pasos de instalación más abajo.

## Finalidad

El Service Worker permite que BioDomo conserve una copia local de la página y de
los recursos visuales esenciales. Así, después de una primera visita con
conexión, el contenido principal sigue disponible si la conexión se interrumpe.
También evita volver a descargar esos recursos en cada visita.

## Por qué y para qué se utiliza

- **Continuidad sin conexión:** la página HTML, la hoja de estilos, el logotipo y
  la imagen principal se precargan para poder mostrar la experiencia básica
  offline.
- **Carga más eficiente:** los estilos e imágenes guardados se sirven desde la
  caché del navegador.
- **Actualizaciones controladas:** el nombre versionado de la caché permite
  sustituir recursos y retirar cachés antiguas al activar una nueva versión.
- **Instalación como aplicación:** el manifest declara el nombre, los colores,
  la pantalla de inicio y los íconos que los navegadores usan para ofrecer la
  instalación.

Este Service Worker no convierte en offline las funciones que dependan de un
servidor ni afecta al hardware IoT. El video de demostración no se precarga ni se
guarda en caché; así se evita descargar un archivo potencialmente pesado y se
preserva su comportamiento de reproducción y solicitudes por rangos.

## Cómo funciona

El archivo [`../service-worker.js`](../service-worker.js) se registra desde
`index.html` cuando la página termina de cargar y el navegador admite Service
Workers.

1. **Instalación:** precarga la página, el manifest y sus recursos esenciales en
   `biodomo-static-v2`. Si la precarga falla, la instalación no se completa.
2. **Activación:** elimina versiones anteriores de las cachés de BioDomo y toma
   control de las pestañas abiertas.
3. **Navegaciones:** intenta obtener la página de la red para mostrar contenido
   actualizado. Si no hay conexión, entrega la copia local de `index.html`.
4. **Recursos estáticos:** para estilos e imágenes usa primero la copia en caché;
   si falta, consulta la red y guarda una respuesta correcta del mismo origen.
5. **Otros recursos:** no intercepta solicitudes que no sean GET, de otros
   orígenes, de video o que incluyan un encabezado `Range`.

## Cambios y mantenimiento

Al cambiar recursos estáticos, incrementa la versión de `CACHE_NAME` en
`service-worker.js` (por ejemplo, de `v1` a `v2`). Actualiza también
`PRECACHE_URLS` si agregas recursos imprescindibles para la experiencia offline.
La activación eliminará automáticamente las cachés `biodomo-static-*` anteriores.

## Requisitos y comprobación

Los navegadores solo permiten registrar Service Workers en un contexto seguro:
usa HTTPS en producción o `localhost` para desarrollo. No abras `index.html`
directamente con `file://` ni lo pruebes mediante un servidor que no esté
sirviendo los archivos desde la raíz esperada.

Vercel sirve el proyecto estático sobre HTTPS automáticamente en sus dominios
de despliegue. No se requiere una configuración especial de Vercel: asegúrate de
que `index.html`, `manifest.webmanifest`, `service-worker.js` y `assets/` se
publiquen desde la misma raíz.

### Instalar BioDomo

El manifest define BioDomo como una aplicación `standalone`, con ruta inicial
`./` y los íconos de 192 × 192 y 512 × 512 píxeles. En navegadores compatibles,
el botón **Instalar BioDomo** aparece cuando el navegador ofrece la instalación;
al pulsarlo se abre el diálogo nativo. También se puede usar la opción de
instalación del menú del navegador. En iPhone/iPad, Safari no ofrece el mismo
evento de instalación: usa **Compartir > Añadir a pantalla de inicio**.

Los requisitos y la disponibilidad del botón dependen del navegador. La
instalación se habilita después de desplegar en HTTPS y de que el navegador haya
cargado correctamente el manifest, sus íconos y el Service Worker. En Chrome,
valida el manifest en **Application > Manifest** y el Service Worker en
**Application > Service Workers**.

### Evidencias solicitadas

Toma estas capturas en Chrome o Edge después de abrir la versión publicada en
Vercel bajo `https://<dominio>/AppCurso/` y esperar a que termine la instalación
del Service Worker. Las capturas deben mostrar el sitio desplegado y el panel de
DevTools; no se deben sustituir por imágenes de ejemplo.

1. **Service Worker activo:** abre DevTools con **F12**, entra en
   **Application > Service Workers** y captura el panel donde el Service Worker
   de BioDomo muestra el estado **“activated and is running”**. Confirma que el
   script corresponde a `/AppCurso/service-worker.js`.
2. **Recursos almacenados:** en **Application > Cache Storage**, abre la caché
   `biodomo-static-v2` y captura la lista de solicitudes almacenadas. La evidencia
   debe permitir verificar que sus URLs pertenecen a `/AppCurso/`, por ejemplo
   `/AppCurso/index.html`, `/AppCurso/css/styles.css`,
   `/AppCurso/assets/hero.jpg`, `/AppCurso/manifest.webmanifest` y los íconos de
   `/AppCurso/assets/pwa-icons/`.

Guarda ambas capturas junto con la entrega. Para que las rutas aparezcan con el
prefijo `/AppCurso/`, el despliegue debe servir `index.html`, `service-worker.js`
y todos los recursos desde esa ruta. Si el proyecto se publica en la raíz del
dominio en Vercel, las entradas de la caché aparecerán bajo `/` en lugar de
`/AppCurso/`; el prefijo de ruta debe corresponder al URL real del despliegue.

Para comprobarlo:

1. Sirve el proyecto por HTTPS o desde `localhost` y abre la página.
2. En las herramientas de desarrollo del navegador, revisa **Application >
   Manifest**, **Service Workers** y **Cache Storage** para confirmar el manifest,
   el registro y los recursos precargados.
3. Recarga la página, activa el modo offline en las herramientas de desarrollo
   y navega o recarga de nuevo. La página principal debe seguir disponible.
4. Vuelve a conectarte para que las navegaciones puedan obtener la versión más
   reciente desde la red.
