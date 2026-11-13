const crypto = require("node:crypto");
const {
    exceedsBodyLimit,
    getRedis,
    hasValidAdminToken,
    readJsonBody,
    requireSameOrigin,
    sendJson
} = require("./push");

const PLANTS_KEY = "biodomo:garden:plants";
const READINGS_KEY_PREFIX = "biodomo:garden:readings:";
const PLANT_STATUSES = new Set(["germinacion", "crecimiento", "cosecha"]);

function authorizeRequest(request, response, allowedMethods) {
    if (!allowedMethods.includes(request.method)) {
        response.setHeader("Allow", allowedMethods.join(", "));
        sendJson(response, 405, { error: "Método no permitido." });
        return false;
    }
    if (!requireSameOrigin(request, response)) {
        return false;
    }
    if (!hasValidAdminToken(request)) {
        sendJson(response, 401, { error: "Secreto de administración no válido." });
        return false;
    }
    if (request.method !== "GET" && exceedsBodyLimit(request)) {
        sendJson(response, 413, { error: "La solicitud excede el tamaño permitido." });
        return false;
    }
    return true;
}

function parseBody(request, response) {
    try {
        const body = readJsonBody(request);
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            sendJson(response, 400, { error: "El cuerpo de la solicitud debe ser un objeto JSON." });
            return null;
        }
        return body;
    } catch {
        sendJson(response, 400, { error: "El cuerpo de la solicitud debe ser JSON válido." });
        return null;
    }
}

function getPlantId(request, parameter = "id") {
    const id = request.query && request.query[parameter];
    return typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id) ? id : null;
}

function normalizeText(value, maximumLength) {
    if (typeof value !== "string") {
        return "";
    }
    const text = value.trim();
    return text.length <= maximumLength ? text : "";
}

function parsePlant(value) {
    try {
        return typeof value === "string" ? JSON.parse(value) : value;
    } catch (error) {
        console.error("No se pudo interpretar un registro del huerto:", error);
        throw new Error("Los datos guardados del huerto no se pudieron leer.");
    }
}

async function getPlants(redis) {
    const storedPlants = await redis.hgetall(PLANTS_KEY) || {};
    return Object.entries(storedPlants)
        .map(([id, value]) => parsePlant(value) || { id })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

module.exports = {
    PLANTS_KEY,
    PLANT_STATUSES,
    READINGS_KEY_PREFIX,
    authorizeRequest,
    getPlantId,
    getPlants,
    normalizeText,
    parseBody,
    sendJson
};
