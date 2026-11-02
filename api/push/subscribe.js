const {
    getRedis,
    hasValidSubscriptionShape,
    readJsonBody,
    requireMethod,
    requireSameOrigin,
    exceedsBodyLimit,
    sendJson,
    SUBSCRIPTIONS_KEY,
    subscriptionId,
    subscriptionRateLimitKey
} = require("../../server/push");

module.exports = async function handler(request, response) {
    if (!requireMethod(request, response, "POST")
        || !requireSameOrigin(request, response)) {
        return;
    }
    if (exceedsBodyLimit(request)) {
        return sendJson(response, 413, { error: "La solicitud excede el tamaño permitido." });
    }

    let subscription;
    try {
        subscription = readJsonBody(request);
    } catch {
        return sendJson(response, 400, { error: "El cuerpo de la solicitud debe ser JSON válido." });
    }

    if (!hasValidSubscriptionShape(subscription)) {
        return sendJson(response, 400, { error: "La suscripción push no es válida." });
    }

    try {
        const redis = getRedis();
        const id = subscriptionId(subscription.endpoint);
        const alreadyStored = await redis.hget(SUBSCRIPTIONS_KEY, id);
        if (!alreadyStored) {
            const rateLimitKey = subscriptionRateLimitKey(request);
            const attemptCount = await redis.incr(rateLimitKey);
            if (attemptCount === 1) {
                await redis.expire(rateLimitKey, 60 * 60);
            }
            if (attemptCount > 20) {
                return sendJson(response, 429, { error: "Se alcanzó el límite de suscripciones. Inténtalo más tarde." });
            }
            if (await redis.hlen(SUBSCRIPTIONS_KEY) >= 500) {
                return sendJson(response, 429, { error: "Se alcanzó el límite de dispositivos suscritos." });
            }
        }
        await redis.hset(SUBSCRIPTIONS_KEY, {
            [id]: JSON.stringify(subscription)
        });
        return sendJson(response, 201, { saved: true });
    } catch (error) {
        console.error("No se pudo guardar una suscripción push:", error);
        return sendJson(response, 503, { error: "No se pudo guardar la suscripción en Redis." });
    }
};
