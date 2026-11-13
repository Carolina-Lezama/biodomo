# Lista de cotejo PWA de BioDomo

Marca **Listo** cuando la característica esté implementada y **Evidencia** solo
después de comprobarla en el despliegue. Las capturas deben ser propias del sitio
publicado; no se deben reemplazar por imágenes de ejemplo.

| # | Característica PWA | Listo | Evidencia de verificación |
| --- | --- | --- | --- |
| 1 | Manifest enlazado desde la página e identidad en español: nombre, nombre corto, descripción y URL inicial. | [x] | DevTools > Application > Manifest. |
| 2 | Presentación `standalone` y colores de tema/fondo para la ventana instalada. | [x] | Instalar la aplicación y revisar su ventana independiente. |
| 3 | Íconos de instalación de 192×192 y 512×512, más Apple Touch Icon. | [x] | Manifest y vista previa del icono en el navegador. |
| 4 | Invitación de instalación basada en `beforeinstallprompt` y limpieza al instalar. | [x] | Chrome/Edge: comprobar el botón **Instalar BioDomo** y el evento `appinstalled`. |
| 5 | Registro del Service Worker al terminar la carga, con errores visibles en consola. | [x] | DevTools > Application > Service Workers. |
| 6 | Precaché versionada de la app shell, estilos, scripts e imágenes esenciales. | [x] | DevTools > Application > Cache Storage; comprobar `biodomo-static-v6`. |
| 7 | Navegación con estrategia red primero y página almacenada como alternativa offline. | [x] | Cargar una vez; activar Offline en DevTools y recargar. |
| 8 | Recursos estáticos servidos desde caché y actualización de recursos correctos del mismo origen. | [x] | Inspeccionar Network con caché activa y luego con conexión. |
| 9 | Retiro de cachés estáticas antiguas al activar la versión nueva del Service Worker. | [x] | Actualizar la versión del SW y revisar Cache Storage tras activación. |
| 10 | Interfaz adaptable para pantallas móviles y escritorio. | [x] | Revisar a ancho móvil y escritorio en DevTools > Device Toolbar. |
| 11 | Solicitud de permiso push iniciada por una acción explícita de la persona usuaria. | [x] | HTTPS: pulsar **Activar notificaciones** y revisar el permiso del navegador. |
| 12 | Recepción de Web Push con la app cerrada y apertura/enfoque al pulsar el aviso. | [x] | Requiere VAPID y Upstash configurados; enviar aviso y capturar la notificación. |
| 13 | Gestión backend CRUD de plantas y persistencia remota en Redis. | [x] | Crear, actualizar, volver a conectar y eliminar una planta en **Mi huerto**. |
| 14 | Registro e historial persistente de cuatro variables por planta: temperatura, humedad, pH y luz. | [x] | Guardar medición y comprobar valores/hora en el historial tras reconectar. |
| 15 | Acceso al backend protegido por secreto, misma procedencia y validación de datos. | [x] | Probar secreto inválido, origen diferente y lecturas fuera de rango. |
| 16 | Uso del sitio con conexión perdida: la shell estática abre, pero las operaciones remotas notifican que requieren red. | [x] | Activar Offline y probar tanto la página como una operación del huerto. |
| 17 | Mensajes de estado accesibles para lectores de pantalla mediante regiones `role="status"` y `aria-live`. | [x] | Revisar el DOM y probar navegación por teclado/lector de pantalla. |

## Requisitos para dar por validada la entrega

- Servir el sitio desde HTTPS (o `localhost` durante desarrollo); no usar `file://`.
- Completar las evidencias del despliegue real y guardar capturas del manifest,
  Service Worker activo, caché y una operación del backend.
- La persistencia del huerto requiere Upstash y `ADMIN_SECRET`; Web Push requiere
  además las variables VAPID indicadas en [push-notifications.md](./push-notifications.md).
- El registro manual de sensores no equivale a una conexión física con el módulo
  IoT. Esa integración queda pendiente de disponer del hardware y su protocolo.
