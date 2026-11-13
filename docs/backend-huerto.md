# Backend y base de datos de BioDomo

BioDomo incorpora un backend serverless para gestionar el huerto doméstico. La
interfaz de `index.html` consume funciones de Vercel en `api/garden/`; los datos
se guardan en la instancia Upstash Redis que ya utiliza el módulo de Web Push.
Redis es una base de datos NoSQL clave-valor, no una base relacional.

## Funcionalidades

- Crear, consultar, actualizar y eliminar plantas.
- Cambiar la etapa entre germinación, crecimiento y cosecha.
- Registrar la fecha del último riego.
- Guardar mediciones de temperatura, humedad, pH e iluminación por planta.
- Mostrar hasta 50 mediciones recientes por planta.
- Eliminar las mediciones de una planta cuando se elimina dicha planta.

Las mediciones se capturan desde el formulario; esta entrega no conecta todavía
la placa IoT ni recibe lecturas automáticas de sensores.

## Estructura de datos

| Clave Redis | Tipo | Contenido |
| --- | --- | --- |
| `biodomo:garden:plants` | Hash | Un JSON por planta, indexado por UUID. Incluye nombre, especie, ubicación, etapa, fecha de riego y fechas de creación/actualización. |
| `biodomo:garden:readings:<plantId>` | Lista | JSON de mediciones ordenado de más reciente a más antigua; se conservan como máximo 50 por planta. Cada registro incluye UUID, planta, temperatura en °C, humedad en %, pH, luz en lux y fecha. |

El backend limita el huerto a 100 plantas. Las lecturas aceptadas son:

- Temperatura: de -20 a 70 °C.
- Humedad: de 0 a 100 %.
- pH: de 0 a 14.
- Iluminación: de 0 a 100000 lux.

## API

Todas las rutas requieren HTTPS en producción, solicitudes del mismo origen y
`Authorization: Bearer <ADMIN_SECRET>`. Se acepta `PUSH_ADMIN_TOKEN` como
compatibilidad con despliegues anteriores. No se envía el secreto en la URL ni
se persiste en `localStorage`; el formulario lo conserva en memoria mientras
permanece abierta la pestaña. Este es un control de acceso compartido para una
instalación de demostración, no sustituye cuentas, roles ni sesiones de usuario.

| Método y ruta | Acción |
| --- | --- |
| `GET /api/garden/plants` | Devuelve las plantas. |
| `POST /api/garden/plants` | Crea una planta con `name`, `species` y `location`. |
| `PATCH /api/garden/plants?id=<uuid>` | Actualiza `name`, `species`, `location`, `status` o registra `wateredNow: true`. |
| `DELETE /api/garden/plants?id=<uuid>` | Elimina la planta y su historial de lecturas. |
| `GET /api/garden/readings?plantId=<uuid>` | Devuelve hasta 50 lecturas de una planta. |
| `POST /api/garden/readings` | Agrega una lectura con `plantId`, `temperatureC`, `humidity`, `ph` y `lightLux`. |

La API devuelve JSON y códigos HTTP explícitos para métodos no permitidos,
credenciales inválidas, datos incompletos, límites y errores de persistencia.
Las lecturas y plantas no se almacenan en la caché del Service Worker.

## Configuración

1. Instala dependencias con `npm install`.
2. Crea una base Redis en Upstash y configura
   `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en Vercel.
3. Configura `ADMIN_SECRET` con un valor aleatorio de al menos 32 caracteres.
   La misma variable protege las funciones de huerto y el envío de notificaciones.
4. Copia las variables a `.env.local` si usarás `npx vercel dev`. No compartas
   secretos ni los incluyas en Git; `.env.example` solo enumera nombres.
5. Ejecuta `npm test` y despliega. Comprueba las operaciones desde la sección
   **Mi huerto** bajo HTTPS.

El backend del huerto solo necesita las variables de Upstash y el secreto de
administración. Las claves VAPID son necesarias únicamente para activar Web Push.
Si aún no se han configurado esas variables, la página informará que no pudo
conectar y no presentará datos inventados.

## Comprobación manual

1. Conecta con el secreto de administración y confirma que la lista se carga.
2. Crea una planta, cambia su etapa y registra un riego; vuelve a conectar y
   verifica que los datos siguen en Redis.
3. Registra una lectura dentro de los rangos y confirma que aparece en el
   historial de esa planta.
4. Prueba valores fuera de rango y un secreto incorrecto; la API debe rechazarlos.
5. Elimina la planta y verifica que también desaparece su historial.
6. Desconecta la red: el cascarón PWA sigue cargando, pero las operaciones del
   backend requieren conexión y muestran el error correspondiente.
