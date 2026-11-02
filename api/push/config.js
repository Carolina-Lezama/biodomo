const { getRedis, getWebPush, getVapidPublicKey, requireMethod, sendJson } = require("../../server/push");

module.exports = async function handler(request, response) {
    if (!requireMethod(request, response, "GET")) {
        return;
    }

    const requiredVariables = [
        ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", getVapidPublicKey()],
        ["VAPID_PRIVATE_KEY", process.env.VAPID_PRIVATE_KEY],
        ["VAPID_SUBJECT", process.env.VAPID_SUBJECT],
        ["UPSTASH_REDIS_REST_URL", process.env.UPSTASH_REDIS_REST_URL],
        ["UPSTASH_REDIS_REST_TOKEN", process.env.UPSTASH_REDIS_REST_TOKEN],
        ["ADMIN_SECRET", process.env.ADMIN_SECRET || process.env.PUSH_ADMIN_TOKEN]
    ];
    const missingVariables = requiredVariables
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (missingVariables.length > 0) {
        return sendJson(response, 503, {
            error: `Faltan variables de entorno: ${missingVariables.join(", ")}. Revisa Production/Preview en Vercel y vuelve a desplegar.`
        });
    }

    if ((process.env.ADMIN_SECRET || process.env.PUSH_ADMIN_TOKEN).length < 32) {
        return sendJson(response, 503, {
            error: "ADMIN_SECRET debe tener al menos 32 caracteres. Actualízalo en Vercel y vuelve a desplegar."
        });
    }

    try {
        getWebPush();
        getRedis();
        return sendJson(response, 200, { publicKey: getVapidPublicKey() });
    } catch (error) {
        console.error("La configuración del servicio push no es válida:", error.message);
        return sendJson(response, 503, {
            error: "No se pudo validar la configuración de VAPID o Upstash. Revisa las variables y vuelve a desplegar."
        });
    }
};
