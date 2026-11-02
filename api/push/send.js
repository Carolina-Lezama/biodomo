const {
    getRedis,
    getWebPush,
    hasValidAdminToken,
    readJsonBody,
    requireMethod,
    requireSameOrigin,
    exceedsBodyLimit,
    sendJson,
    SUBSCRIPTIONS_KEY
} = require("../../server/push");

module.exports = async function handler(request, response) {
    if (!requireMethod(request, response, "POST")
        || !requireSameOrigin(request, response)) {
        return;
    }
    if (!hasValidAdminToken(request)) {
        return sendJson(response, 401, { error: "Secreto de administración no válido." });
    }
    if (exceedsBodyLimit(request)) {
        return sendJson(response, 413, { error: "La solicitud excede el tamaño permitido." });
    }

    let payload;
    try {
        payload = readJsonBody(request);
    } catch {
        return sendJson(response, 400, { error: "El cuerpo de la solicitud debe ser JSON válido." });
    }

    if (!payload || typeof payload.title !== "string" || typeof payload.message !== "string") {
        return sendJson(response, 400, { error: "Se requiere un título y un mensaje." });
    }
    const title = payload.title.trim();
    const message = payload.message.trim();
    if (!title || title.length > 60 || !message || message.length > 180) {
        return sendJson(response, 400, { error: "El título y el mensaje exceden los límites permitidos." });
    }

    try {
        const redis = getRedis();
        const push = getWebPush();
        const storedSubscriptions = await redis.hgetall(SUBSCRIPTIONS_KEY) || {};
        const subscriptions = Object.entries(storedSubscriptions).map(([id, value]) => {
            const subscription = typeof value === "string" ? JSON.parse(value) : value;
            return { id, subscription };
        });

        if (subscriptions.length === 0) {
            return sendJson(response, 200, { sent: 0, failed: 0, total: 0 });
        }

        const results = await Promise.all(subscriptions.map(async ({ id, subscription }) => {
            try {
                await push.sendNotification(subscription, JSON.stringify({ title, body: message }), {
                    TTL: 60 * 60 * 24
                });
                return { sent: true };
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await redis.hdel(SUBSCRIPTIONS_KEY, id);
                } else {
                    console.error("Falló una entrega push con código:", error.statusCode || "desconocido");
                }
                return { sent: false };
            }
        }));
        const sent = results.filter((result) => result.sent).length;
        const failed = results.length - sent;
        return sendJson(response, 200, { sent, failed, total: results.length });
    } catch (error) {
        console.error("No se pudo completar el envío push:", error);
        return sendJson(response, 503, { error: "No se pudo enviar. Verifica la configuración de VAPID y Upstash." });
    }
};
