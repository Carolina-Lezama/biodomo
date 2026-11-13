const crypto = require("node:crypto");
const { getRedis } = require("../../server/push");
const {
    PLANTS_KEY,
    READINGS_KEY_PREFIX,
    authorizeRequest,
    getPlantId,
    parseBody,
    sendJson
} = require("../../server/garden");

function validReadingValue(value, minimum, maximum) {
    return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

module.exports = async function handler(request, response) {
    if (!authorizeRequest(request, response, ["GET", "POST"])) {
        return;
    }

    try {
        const redis = getRedis();
        const plantId = getPlantId(request, "plantId");
        if (request.method === "GET") {
            if (!plantId) {
                return sendJson(response, 400, { error: "Se requiere un identificador de planta válido." });
            }
            const readings = await redis.lrange(`${READINGS_KEY_PREFIX}${plantId}`, 0, 49) || [];
            return sendJson(response, 200, {
                readings: readings.map((reading) => typeof reading === "string" ? JSON.parse(reading) : reading)
            });
        }

        const body = parseBody(request, response);
        if (!body) return;
        const bodyPlantId = typeof body.plantId === "string" && /^[a-f0-9-]{36}$/i.test(body.plantId)
            ? body.plantId
            : null;
        if (!bodyPlantId || !await redis.hget(PLANTS_KEY, bodyPlantId)) {
            return sendJson(response, 400, { error: "Selecciona una planta existente para registrar la lectura." });
        }
        const fields = [
            ["temperatureC", -20, 70],
            ["humidity", 0, 100],
            ["ph", 0, 14],
            ["lightLux", 0, 100000]
        ];
        if (!fields.every(([field, min, max]) => validReadingValue(body[field], min, max))) {
            return sendJson(response, 400, {
                error: "Temperatura (-20 a 70 °C), humedad (0 a 100 %), pH (0 a 14) e iluminación (0 a 100000 lux) son obligatorios."
            });
        }

        const reading = {
            id: crypto.randomUUID(),
            plantId: bodyPlantId,
            temperatureC: body.temperatureC,
            humidity: body.humidity,
            ph: body.ph,
            lightLux: body.lightLux,
            recordedAt: new Date().toISOString()
        };
        const key = `${READINGS_KEY_PREFIX}${bodyPlantId}`;
        await redis.lpush(key, JSON.stringify(reading));
        await redis.ltrim(key, 0, 49);
        return sendJson(response, 201, { reading });
    } catch (error) {
        console.error("No se pudo completar la operación de lecturas:", error);
        return sendJson(response, 503, { error: "No se pudo acceder a las lecturas del huerto." });
    }
};
