# Notificaciones push en BioDomo

## Componentes

- **Push API y Notifications API:** el navegador solicita permiso y crea una
  suscripción para este dispositivo.
- **Service Worker:** recibe el evento `push` cuando la página no está abierta
  y muestra el aviso; `notificationclick` abre o enfoca BioDomo.
- **Backend en Vercel Functions:** `/api/push/subscribe` guarda suscripciones;
  `/api/push/send` valida el secreto de administración y envía el mensaje al
  servicio push del navegador.
- **VAPID:** claves pública y privada identifican al servidor emisor. La clave
  privada solo vive en variables de entorno del servidor.
- **Upstash Redis:** almacena suscripciones entre invocaciones serverless y
  despliegues.
- **HTTPS:** requisito del navegador para Push y Service Workers (excepto
  `localhost` en desarrollo).

## Configuración requerida para producción

El código está preparado para Vercel + Upstash, pero no puede enviar push hasta
que se conecten esos servicios y se configuren secretos en el proyecto:

1. Instala las dependencias con `npm install`.
2. Crea una base de datos Redis en Upstash y conecta sus variables REST
   `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` al proyecto Vercel.
3. Genera un par de claves VAPID desde la raíz del proyecto:

   ```sh
   npx web-push generate-vapid-keys
   ```

   Configura los valores resultantes como `NEXT_PUBLIC_VAPID_PUBLIC_KEY` y
   `VAPID_PRIVATE_KEY`. Configura también `VAPID_SUBJECT` con un contacto válido,
   por ejemplo `mailto:admin@tu-dominio.com`.
4. Genera un secreto aleatorio largo (al menos 32 caracteres) y guárdalo como
   `ADMIN_SECRET`. Compártelo solo con las personas autorizadas para enviar
   avisos. Puedes generarlo con
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
   Nunca lo pongas en el código ni en el repositorio.
5. Agrega todas las variables en **Vercel > Project > Settings > Environment
   Variables** para Preview/Production según corresponda y vuelve a desplegar.
   `.env.example` enumera las variables; no contiene credenciales reales.

No compartas conmigo ni pegues en el repositorio las claves privadas, el token
de administración ni el token de Upstash. La clave pública VAPID se entrega al
navegador mediante `/api/push/config`; los otros secretos permanecen en el
servidor.

## Cómo probar el flujo

Si `/api/push/config` responde `503`, confirma que las seis variables
(`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` y
`ADMIN_SECRET`) existen en el entorno que corresponde al despliegue visitado
(Production o Preview). Vercel solo aplica cambios de variables a nuevos
despliegues: vuelve a desplegar después de añadirlas. El endpoint informa qué
nombres faltan sin revelar ningún valor secreto.

Si el mensaje indica que **VAPID no es válida**, vuelve a generar un único par
con `npx web-push generate-vapid-keys` y copia juntos `publicKey` a
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` y `privateKey` a `VAPID_PRIVATE_KEY`, sin comillas,
prefijos ni espacios. El valor de `VAPID_SUBJECT` debe comenzar por `mailto:` o
ser una URL. Si indica que **Upstash no respondió**, confirma que la URL y el
token pertenecen a la misma base Redis y vuelve a copiarlos desde su panel. Que
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` sea una variable tipo Config y las demás sean
Secrets es válido: el backend las lee con `process.env`, y la pública se entrega
al navegador por la API.

1. Abre el sitio desplegado por HTTPS, activa las notificaciones y acepta el
   permiso. El navegador registra la suscripción de ese dispositivo en Redis.
2. Repite la activación en cada dispositivo que quieras incluir como receptor.
   Cada navegador tiene su propia suscripción.
3. Escribe el título, el mensaje y el `ADMIN_SECRET`; selecciona **Enviar
   notificación**. El backend envía el aviso a todas las suscripciones guardadas.
4. Comprueba el aviso del sistema y su historial en la página. El historial es
   local a ese navegador; no es un registro central del backend.

Para probar en desarrollo, usa Vercel CLI (`npx vercel dev`) y un `.env.local`
con los mismos valores válidos de VAPID/Upstash. `localhost` es un contexto
seguro aceptado por los navegadores. Una página abierta con `file://` no sirve.

## Protección y límites

El endpoint de envío requiere `ADMIN_SECRET` (también acepta `PUSH_ADMIN_TOKEN`
para instalaciones anteriores), compara el secreto en el
servidor y solo acepta solicitudes del mismo origen. Las suscripciones y el
envío se validan en el backend; endpoints expirados (404/410) se eliminan de
Redis. Las suscripciones se limitan a 20 nuevas por IP por hora y a 500
dispositivos en total para acotar abuso/costos. El token se solicita al enviar y
se limpia del formulario al terminar. Trátalo como una contraseña. Si se filtra,
rótalo en Vercel.

El frontend no lee variables de entorno directamente: solicita la clave VAPID
pública al endpoint `/api/push/config`. Aunque Vercel permita marcarla como
secreta, la clave VAPID pública no es un secreto criptográfico; nunca expongas
`VAPID_PRIVATE_KEY`, `ADMIN_SECRET` ni las credenciales de Upstash.

Este ejemplo no tiene usuarios ni segmentación: cualquier administrador con el
secreto envía a todos los dispositivos suscritos. Para producto real, añadir
autenticación de usuarios, consentimiento y preferencias de suscripción,
auditoría y límites de envío.
