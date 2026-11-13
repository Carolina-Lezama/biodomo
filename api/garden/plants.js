const crypto = require("node:crypto");
const { getRedis } = require("../../server/push");
const {
    PLANTS_KEY,
    PLANT_STATUSES,
    READINGS_KEY_PREFIX,
    authorizeRequest,
    getPlantId,
    getPlants,
    normalizeText,
    parseBody,
    sendJson
} = require("../../server/garden");

module.exports = async function handler(request, response) {
    if (!authorizeRequest(request, response, ["GET", "POST", "PATCH", "DELETE"])) {
        return;
    }

    try {
        const redis = getRedis();
        if (request.method === "GET") {
            return sendJson(response, 200, { plants: await getPlants(redis) });
        }

        if (request.method === "POST") {
            const body = parseBody(request, response);
            if (!body) return;
            const name = normalizeText(body.name, 50);
            const species = normalizeText(body.species, 60);
            const location = normalizeText(body.location, 60);
            if (!name || !species || !location) {
                return sendJson(response, 400, {
                    error: "Nombre, especie y ubicación son obligatorios (máximo 50/60/60 caracteres)."
                });
            }
            if (await redis.hlen(PLANTS_KEY) >= 100) {
                return sendJson(response, 409, { error: "El huerto alcanzó el límite de 100 plantas." });
            }

            const now = new Date().toISOString();
            const plant = {
                id: crypto.randomUUID(),
                name,
                species,
                location,
                status: "germinacion",
                wateredAt: null,
                createdAt: now,
                updatedAt: now
            };
            await redis.hset(PLANTS_KEY, { [plant.id]: JSON.stringify(plant) });
            return sendJson(response, 201, { plant });
        }

        const id = getPlantId(request);
        if (!id) {
            return sendJson(response, 400, { error: "Se requiere un identificador de planta válido." });
        }

        const storedPlant = await redis.hget(PLANTS_KEY, id);
        if (!storedPlant) {
            return sendJson(response, 404, { error: "No se encontró la planta solicitada." });
        }

        if (request.method === "DELETE") {
            await redis.hdel(PLANTS_KEY, id);
            await redis.del(`${READINGS_KEY_PREFIX}${id}`);
            return sendJson(response, 200, { deleted: true });
        }

        const body = parseBody(request, response);
        if (!body) return;
        const plant = typeof storedPlant === "string" ? JSON.parse(storedPlant) : storedPlant;
        const updates = {};

        for (const [field, maximumLength] of [["name", 50], ["species", 60], ["location", 60]]) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                const value = normalizeText(body[field], maximumLength);
                if (!value) {
                    return sendJson(response, 400, { error: `${field} no puede estar vacío.` });
                }
                updates[field] = value;
            }
        }
        if (Object.prototype.hasOwnProperty.call(body, "status")) {
            if (!PLANT_STATUSES.has(body.status)) {
                return sendJson(response, 400, { error: "La etapa de cultivo no es válida." });
            }
            updates.status = body.status;
        }
        if (body.wateredNow === true) {
            updates.wateredAt = new Date().toISOString();
        }
        if (Object.keys(updates).length === 0) {
            return sendJson(response, 400, { error: "Indica al menos un campo válido para actualizar." });
        }

        const updatedPlant = { ...plant, ...updates, updatedAt: new Date().toISOString() };
        await redis.hset(PLANTS_KEY, { [id]: JSON.stringify(updatedPlant) });
        return sendJson(response, 200, { plant: updatedPlant });
    } catch (error) {
        console.error("No se pudo completar la operación del huerto:", error);
        return sendJson(response, 503, { error: "No se pudo acceder a los datos del huerto." });
    }
};
