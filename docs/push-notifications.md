# Notificaciones push en BioDomo

## Componentes y tecnologías

Una implementación de notificaciones push remotas en una PWA suele incluir:

- **HTTPS y una PWA instalada o abierta:** contexto seguro requerido para las
  APIs de Service Worker, Push y Notifications (localhost también sirve para
  desarrollo).
- **Notifications API:** solicita el permiso explícito del usuario y muestra
  notificaciones del sistema.
- **Service Worker:** recibe eventos push aunque la página no esté abierta y
  muestra la notificación con `showNotification()`. También puede reaccionar al
  evento `notificationclick`.
- **Push API:** crea una suscripción por navegador/dispositivo mediante
  `PushManager.subscribe()`. La suscripción contiene un endpoint y claves
  criptográficas.
- **Backend de la aplicación:** genera y protege las claves VAPID, guarda y
  elimina suscripciones, autentica quién puede enviar y solicita el envío al
  servicio push del navegador. La clave privada VAPID nunca debe exponerse en
  el cliente.
- **Servicio push del navegador:** entrega el mensaje cifrado al navegador
  asociado con el endpoint de la suscripción. Lo opera el proveedor del
  navegador; no se debe confundir con el backend de la aplicación.
- **Persistencia y ciclo de vida:** una base de datos para suscripciones,
  mecanismos para retirar endpoints expirados y controles para que solo usuarios
  autorizados reciban mensajes.

Flujo remoto: el usuario concede permiso y crea una suscripción en el navegador;
la aplicación envía esa suscripción al backend; el backend la almacena y, ante
un evento, envía un payload cifrado según Web Push y autentica la solicitud con
VAPID al servicio push; el
Service Worker recibe `push` y presenta la notificación.

## Ejemplo incluido

La sección **Notificaciones** de `index.html` implementa un ejemplo local:

1. El usuario activa las notificaciones mediante un gesto explícito.
2. Escribe un título y mensaje.
3. La aplicación espera el Service Worker activo y muestra una notificación del
   sistema con `ServiceWorkerRegistration.showNotification()`.
4. El historial de los últimos 20 mensajes se muestra en la página y se conserva
   en `localStorage` de ese navegador. Al pulsar una notificación, el Service
   Worker abre o enfoca BioDomo.

La lógica de interfaz está en `js/notifications.js`; el registro del Service
Worker sigue en `index.html`, y el evento de clic está en `service-worker.js`.
Al añadir el script a la precarga se actualizó la caché estática a
`biodomo-static-v3`.

**Límite del ejemplo:** este proyecto no incluye backend, suscripciones Push,
claves VAPID ni envío remoto. El botón genera una notificación local desde la
PWA; no permite enviar avisos cuando el usuario está desconectado de BioDomo o
la aplicación no puede ejecutar el código. Para push real hay que implementar
el flujo de suscripción y un endpoint de servidor protegido, así como guardar
las suscripciones y gestionar errores del servicio push.

## Prueba

1. Sirve la carpeta desde HTTPS o `localhost` (no abras el HTML con `file://`).
2. Abre BioDomo, concede permiso y envía un mensaje desde **Notificaciones**.
3. Verifica la notificación del sistema y la entrada del historial. Cierra la
   pestaña y prueba el clic en la notificación mientras el Service Worker siga
   registrado.
4. En DevTools, revisa **Application > Service Workers** y **Notifications**.
   El permiso se puede revocar desde la configuración del sitio.

La entrega del sistema operativo y la disponibilidad de notificaciones dependen
del navegador, sus permisos y la configuración del dispositivo.
