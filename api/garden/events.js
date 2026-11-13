const crypto = require("node:crypto");
const { getRedis } = require("../../server/push");
const {
    PLANTS_KEY,
    EVENTS_KEY,
    GARDEN_EVENT_TYPES,
    authorizeRequest,
    getPlantId,
    normalizeText,
    parseBody,
    sendJson
} = require("../../server/garden");

const EVENT_HISTORY_LIMIT = 300;
const EVENT_RESPONSE_LIMIT = 100;

module.exports = async function handler(request, response) {
    if (!authorizeRequest(request, response, ["GET", "POST"])) {
        return;
    }

    try {
        const redis = getRedis();
        if (request.method === "GET") {
            const requestedPlantId = request.query && request.query.plantId;
            const plantId = requestedPlantId === undefined ? null : getPlantId(request, "plantId");
            if (requestedPlantId !== undefined && !plantId) {
                return sendJson(response, 400, { error: "El identificador de planta no es válido." });
            }
            const storedEvents = await redis.lrange(EVENTS_KEY, 0, EVENT_HISTORY_LIMIT - 1) || [];
            const events = storedEvents
                .map((event) => typeof event === "string" ? JSON.parse(event) : event)
                .filter((event) => !plantId || event.plantId === plantId)
                .slice(0, EVENT_RESPONSE_LIMIT);
            return sendJson(response, 200, { events });
        }

        const body = parseBody(request, response);
        if (!body) return;
        const plantId = typeof body.plantId === "string" && /^[a-f0-9-]{36}$/i.test(body.plantId)
            ? body.plantId
            : null;
        const storedPlant = plantId ? await redis.hget(PLANTS_KEY, plantId) : null;
        if (!storedPlant) {
            return sendJson(response, 400, { error: "Selecciona una planta existente para registrar el evento." });
        }
        if (!GARDEN_EVENT_TYPES.has(body.eventType)) {
            return sendJson(response, 400, { error: "El tipo de actividad no es válido." });
        }
        const note = normalizeText(body.note, 300);
        if (!note) {
            return sendJson(response, 400, { error: "La descripción es obligatoria y admite hasta 300 caracteres." });
        }
        const occurredAt = body.occurredAt === undefined
            ? new Date()
            : typeof body.occurredAt === "string" ? new Date(body.occurredAt) : new Date(Number.NaN);
        if (Number.isNaN(occurredAt.getTime())) {
            return sendJson(response, 400, { error: "La fecha de la actividad no es válida." });
        }

        const plant = typeof storedPlant === "string" ? JSON.parse(storedPlant) : storedPlant;
        const event = {
            id: crypto.randomUUID(),
            plantId,
            plantName: plant.name,
            eventType: body.eventType,
            note,
            occurredAt: occurredAt.toISOString(),
            createdAt: new Date().toISOString()
        };
        await redis.lpush(EVENTS_KEY, JSON.stringify(event));
        await redis.ltrim(EVENTS_KEY, 0, EVENT_HISTORY_LIMIT - 1);
        return sendJson(response, 201, { event });
    } catch (error) {
        console.error("No se pudo completar la operación de bitácora:", error);
        return sendJson(response, 503, { error: "No se pudo acceder a la bitácora de cultivo." });
    }
};
