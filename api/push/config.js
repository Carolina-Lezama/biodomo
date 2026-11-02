const { getRedis, getWebPush, getVapidPublicKey, requireMethod, sendJson } = require("../../server/push");

module.exports = async function handler(request, response) {
    if (!requireMethod(request, response, "GET")) {
        return;
    }

    if (!getVapidPublicKey() || !process.env.VAPID_PRIVATE_KEY
        || !process.env.VAPID_SUBJECT || !process.env.UPSTASH_REDIS_REST_URL
        || !process.env.UPSTASH_REDIS_REST_TOKEN
        || !(process.env.ADMIN_SECRET || process.env.PUSH_ADMIN_TOKEN)
        || (process.env.ADMIN_SECRET || process.env.PUSH_ADMIN_TOKEN).length < 32) {
        return sendJson(response, 503, {
            error: "El servicio push no está configurado. Consulta docs/push-notifications.md."
        });
    }

    try {
        getWebPush();
        getRedis();
        return sendJson(response, 200, { publicKey: getVapidPublicKey() });
    } catch (error) {
        console.error("La configuración VAPID no es válida:", error.message);
        return sendJson(response, 503, { error: "La configuración de VAPID no es válida." });
    }
};
