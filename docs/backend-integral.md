# Backend integral de BioDomo

Este documento describe los servicios backend de BioDomo: notificaciones Web
Push, administración del huerto, lecturas de sensores capturadas manualmente y
la bitácora de cultivo. Explica qué hace cada módulo, cómo se comunican la PWA,
las funciones serverless y la base de datos, y cómo configurar y verificar el
proyecto.

## 1. Propósito y arquitectura

El backend permite conservar datos entre visitas y despliegues, administrar el
huerto desde la PWA y enviar avisos push a dispositivos suscritos. Las páginas
estáticas y la interfaz no guardan credenciales de servidor.

```text
Navegador / PWA
  ├─ js/notifications.js ── /api/push/* ── Vercel Functions
  ├─ js/garden.js        ── /api/garden/* ─ Vercel Functions
  └─ Service Worker          recibe Push
                                  │
                                  ├─ Upstash Redis (datos persistentes)
                                  └─ Servicios Push del navegador (entrega)
```

- **Frontend:** `index.html`, `js/notifications.js` y `js/garden.js` presentan
  formularios e historiales.
- **API:** los archivos en `api/push/` y `api/garden/` son funciones serverless
  compatibles con el despliegue actual en Vercel.
- **Lógica compartida:** `server/push.js` contiene acceso a Redis, respuestas
  JSON, validación de origen, validaciones de Web Push y autenticación por token.
  `server/garden.js` agrega las reglas compartidas para el huerto.
- **Persistencia:** Upstash Redis se utiliza como base NoSQL. No es una base
  relacional y no requiere migraciones SQL.
- **Entrega push:** el proveedor push asociado a cada navegador entrega el aviso
  al dispositivo; Redis conserva las suscripciones necesarias para enviarlo.

## 2. Módulos funcionales

### 2.1 Notificaciones Web Push

1. El frontend solicita `/api/push/config`. La respuesta contiene únicamente
   la clave pública VAPID; nunca expone la privada ni el token de administración.
2. La persona usuaria concede permiso al navegador. `PushManager` crea la
   suscripción de ese dispositivo.
3. El frontend registra la suscripción en `/api/push/subscribe`.
4. Una persona administradora envía un título y mensaje a `/api/push/send`
   usando el secreto en `Authorization: Bearer ...`.
5. El Service Worker recibe `push`, muestra el aviso y, al pulsarlo, abre o
   enfoca BioDomo.

El envío actual se dirige a todas las suscripciones guardadas; no hay cuentas,
segmentación por usuario ni preferencias por dispositivo. El historial visible
de avisos enviados en el navegador se guarda en `localStorage`, no en Redis.

### 2.2 Administración del huerto

`/api/garden/plants` permite crear, consultar, actualizar y eliminar plantas.
Una planta guarda nombre, especie, ubicación, etapa (`germinacion`,
`crecimiento` o `cosecha`), fecha del último riego y fechas de creación y
actualización. La interfaz permite cambiar la etapa, registrar un riego y
eliminar la planta.

### 2.3 Lecturas de cultivo

`/api/garden/readings` registra y consulta por planta mediciones manuales de:

- Temperatura: -20 a 70 °C.
- Humedad: 0 a 100 %.
- pH: 0 a 14.
- Iluminación: 0 a 100000 lux.

Se conservan hasta 50 lecturas recientes por planta. Esta versión no está
conectada físicamente con sensores ni recibe lecturas automáticas del módulo IoT.

### 2.4 Bitácora de cultivo

La sección **Bitácora** es diferente del módulo de avisos y del historial de
sensores. Registra actividades como siembra, trasplante, fertilización, poda,
cosecha u otra labor; cada evento incluye planta, fecha y descripción. La API
devuelve hasta 100 eventos recientes y conserva hasta 300 en Redis.

El evento guarda también el nombre de la planta al momento del registro. Si
después se elimina la planta, sus lecturas se eliminan, pero sus eventos quedan
como referencia histórica.

## 3. Modelo de datos en Redis

Cada módulo usa claves separadas dentro de la misma base Upstash. La separación
por clave evita mezclar suscripciones push, plantas, mediciones y actividades;
no representa bases físicas distintas.

| Clave                                   | Tipo Redis              | Contenido y retención                                                    |
| --------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `biodomo:push:subscriptions`            | Hash                    | `SHA-256(endpoint) → JSON` de suscripción Push. Máximo 500 dispositivos. |
| `biodomo:push:subscribe-rate:<hash-ip>` | Contador con expiración | Intentos de nuevas suscripciones por dirección IP; expira en una hora.   |
| `biodomo:garden:plants`                 | Hash                    | `UUID → JSON` de cada planta. Máximo 100 plantas.                        |
| `biodomo:garden:readings:<plantId>`     | Lista                   | JSON de mediciones, más reciente primero; máximo 50 por planta.          |
| `biodomo:garden:events`                 | Lista                   | JSON de actividades, más reciente primero; máximo 300 en total.          |

Las claves `biodomo:garden:*` son la base de datos lógica del huerto. La
configuración de notificaciones y el huerto comparten el cliente Upstash, pero
los registros de cada módulo utilizan claves diferentes.

## 4. Referencia de la API

Las respuestas son JSON y no deben almacenarse en caché. Los cuerpos de escritura
están limitados a 8 KiB. Las rutas privadas de huerto requieren un secreto válido
y una solicitud del mismo origen.

### Notificaciones

| Método y ruta              | Acceso                                              | Función                                                                              |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/push/config`     | Sin Bearer; valida configuración del servidor       | Comprueba variables, VAPID y conexión Redis. Devuelve `{ "publicKey": "..." }`.      |
| `POST /api/push/subscribe` | Mismo origen; no requiere secreto de administración | Valida y registra la suscripción de un dispositivo. Devuelve `{ "saved": true }`.    |
| `POST /api/push/send`      | Mismo origen y Bearer de administración             | Envía título/mensaje a todas las suscripciones. Devuelve `sent`, `failed` y `total`. |

`/api/push/send` recibe `{ "title": "...", "message": "..." }`. El título tiene
un máximo de 60 caracteres y el mensaje de 180. La expiración del aviso push se
establece en 24 horas. Las suscripciones que respondan 404 o 410 se eliminan.

### Huerto

Todas estas rutas requieren:

```http
Authorization: Bearer <ADMIN_SECRET>
```

| Método y ruta                             | Función                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /api/garden/plants`                  | Devuelve las plantas ordenadas por actualización más reciente.                  |
| `POST /api/garden/plants`                 | Crea una planta con `name`, `species` y `location`.                             |
| `PATCH /api/garden/plants?id=<uuid>`      | Actualiza campos de la planta o registra el riego con `{ "wateredNow": true }`. |
| `DELETE /api/garden/plants?id=<uuid>`     | Elimina la planta y su historial de lecturas.                                   |
| `GET /api/garden/readings?plantId=<uuid>` | Devuelve las últimas 50 lecturas de la planta.                                  |
| `POST /api/garden/readings`               | Agrega `plantId`, `temperatureC`, `humidity`, `ph` y `lightLux`.                |
| `GET /api/garden/events`                  | Devuelve hasta 100 eventos recientes. Admite `?plantId=<uuid>` para filtrar.    |
| `POST /api/garden/events`                 | Registra `plantId`, `eventType`, `note` y `occurredAt`.                         |

Los valores permitidos para `eventType` son `siembra`, `trasplante`,
`fertilizacion`, `poda`, `cosecha` y `otro`. La descripción admite hasta 300
caracteres. Si no se proporciona una fecha, el servidor usa la hora actual.

### Respuestas de error

- `400`: JSON inválido, campo faltante o valor fuera de rango.
- `401`: secreto de administración ausente o incorrecto.
- `403`: origen o procedencia de la solicitud no autorizados.
- `404`: planta inexistente al actualizar o eliminar una planta.
- `405`: método no permitido; la respuesta incluye `Allow`.
- `413`: cuerpo mayor que el límite.
- `429`: límite de dispositivos o de suscripciones alcanzado.
- `503`: dependencia o configuración de servidor no disponible.

## 5. Seguridad y validaciones

- `ADMIN_SECRET` requiere al menos 32 caracteres. Se compara en el servidor con
  comparación de tiempo constante.
- La misma credencial protege las operaciones del huerto y el envío push.
  `PUSH_ADMIN_TOKEN` se admite como nombre heredado si no está definido
  `ADMIN_SECRET`.
- Los secretos solo se envían en el encabezado Bearer; no se incluyen en URLs ni
  se escriben en el repositorio. La interfaz del huerto los conserva en memoria
  de la pestaña, no en `localStorage`.
- Las solicitudes comparan el origen con el host del sitio. Cuando el navegador
  omite el encabezado `Origin` (por ejemplo, en algunos `GET`), la validación usa
  `Referer` del mismo host o `Sec-Fetch-Site: same-origin`. Un host distinto se
  rechaza.
- Las suscripciones Push solo aceptan endpoints HTTPS de proveedores conocidos
  y claves de cifrado con el formato y tamaños esperados.
- Se permiten hasta 20 suscripciones nuevas por IP por hora y 500 dispositivos
  en total.
- No existen cuentas ni permisos individuales. El secreto es compartido: esta
  protección es apropiada para la demostración, no reemplaza autenticación
  individual para un producto público.

## 6. Configuración de entorno

### Variables para el backend del huerto

| Variable                   | Uso                                              |
| -------------------------- | ------------------------------------------------ |
| `UPSTASH_REDIS_REST_URL`   | URL REST de la base Redis.                       |
| `UPSTASH_REDIS_REST_TOKEN` | Token REST de la misma base.                     |
| `ADMIN_SECRET`             | Secreto de administración, mínimo 32 caracteres. |

### Variables adicionales para Web Push

| Variable                       | Uso                                                     |
| ------------------------------ | ------------------------------------------------------- |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Clave pública VAPID entregada al navegador.             |
| `VAPID_PRIVATE_KEY`            | Clave privada VAPID, solo servidor.                     |
| `VAPID_SUBJECT`                | Contacto VAPID válido, como `mailto:admin@dominio.com`. |

Configura las variables en **Vercel → Project → Settings → Environment
Variables** para los entornos que utilices y vuelve a desplegar tras cambiarlas.
Para desarrollo local, usa `.env.local` con valores válidos y `npx vercel dev`.
No pegues valores secretos en documentación, código, Git o chats.

Para generar o rotar el secreto de administración:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Reemplaza `ADMIN_SECRET` en el entorno de despliegue y en el `.env.local` local
si aplica; después vuelve a desplegar o reinicia el servidor local. No necesitas
crear una credencial distinta para el huerto: se comparte con el backend push.

`GET /api/push/config` requiere que todas las variables de Push y Redis estén
configuradas, valida que las claves VAPID correspondan y prueba `PING` a Redis.
El backend del huerto solo necesita Redis y el secreto; las claves VAPID no son
requisito para gestionar plantas, lecturas o bitácora.

## 7. PWA, caché y disponibilidad

El Service Worker precarga la interfaz y recursos estáticos y ofrece la página
principal como alternativa sin conexión. Las rutas de API no se guardan en la
caché; la gestión del huerto, el historial y Push necesitan red. La caché actual
está versionada como `biodomo-static-v7`.

Los Service Workers y Web Push requieren HTTPS en producción (o `localhost` en
desarrollo). Abrir `index.html` con `file://` no ejecuta el backend.

## 8. Pruebas y verificación

Ejecuta la suite desde la raíz del proyecto:

```sh
npm test
```

Las pruebas usan una implementación simulada de Redis; validan los contratos de
la API sin modificar una base real. Cubren configuración Push, validación VAPID,
autorización, registros de plantas y lecturas, límites de medición y persistencia
de la bitácora en su clave independiente.

Para validar en un despliegue real:

1. Confirma que las variables necesarias estén configuradas para ese entorno y
   que el despliegue sea posterior a cualquier cambio de variables o código.
2. Activa Push desde HTTPS y comprueba la suscripción en varios dispositivos.
3. Conecta **Mi huerto**, crea una planta y registra una medición.
4. Registra una actividad en **Bitácora**; reconecta y verifica que aparezca con
   su fecha, descripción y nombre de planta.
5. Prueba un secreto incorrecto y valores fuera de rango; el servidor debe
   rechazarlos sin exponer credenciales.
6. Prueba la interfaz offline: la shell debe mostrarse y las operaciones remotas
   deben indicar que requieren conexión.

## 9. Límites actuales y siguientes pasos

- La Bitácora y las mediciones son de captura manual; no existe conexión física
  con sensores ni control de bombas o luces.
- El historial push que se muestra al administrador es local al navegador y no
  constituye una auditoría central.
- El secreto compartido no ofrece usuarios, roles, recuperación de cuentas ni
  trazabilidad por persona.
- Para evolucionar a producto real se recomienda autenticación por usuario,
  permisos por huerto, auditoría central, pruebas contra un entorno de staging y
  una integración autenticada con el hardware IoT.

Para el detalle específico de Web Push, consulta
[push-notifications.md](./push-notifications.md); para instalación, caché y
verificación PWA, consulta [service-worker.md](./service-worker.md) y la
[lista de cotejo](./lista-cotejo-pwa.md).
