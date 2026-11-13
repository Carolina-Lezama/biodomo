const crypto = require("node:crypto");
const { Redis } = require("@upstash/redis");
const webPush = require("web-push");

const SUBSCRIPTIONS_KEY = "biodomo:push:subscriptions";

function sendJson(response, status, payload) {
    response.status(status).setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(JSON.stringify(payload));
}

function requireMethod(request, response, method) {
    if (request.method === method) {
        return true;
    }

    response.setHeader("Allow", method);
    sendJson(response, 405, { error: "Método no permitido." });
    return false;
}

function requireSameOrigin(request, response) {
    const origin = request.headers.origin;
    const forwardedHost = request.headers["x-forwarded-host"];
    const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
        || request.headers.host;

    if (!host) {
        sendJson(response, 403, { error: "La solicitud debe provenir del mismo sitio." });
        return false;
    }

    const matchesHost = (value) => {
        try {
            const url = new URL(value);
            return ["http:", "https:"].includes(url.protocol) && url.host === host;
        } catch {
            return false;
        }
    };

    if (origin) {
        if (!matchesHost(origin)) {
            sendJson(response, 403, { error: "La solicitud debe provenir del mismo sitio." });
            return false;
        }
        return true;
    }

    const referer = request.headers.referer;
    if (referer) {
        if (matchesHost(referer)) {
            return true;
        }
        sendJson(response, 403, { error: "La solicitud debe provenir del mismo sitio." });
        return false;
    }

    if (request.headers["sec-fetch-site"] === "same-origin") {
        return true;
    }

    sendJson(response, 403, { error: "La solicitud debe provenir del mismo sitio." });
    return false;
}

function readJsonBody(request) {
    if (request.body && typeof request.body === "object") {
        return request.body;
    }
    if (typeof request.body === "string") {
        return JSON.parse(request.body);
    }
    return {};
}

function exceedsBodyLimit(request) {
    const contentLength = Number(request.headers["content-length"]);
    return Number.isFinite(contentLength) && contentLength > 8192;
}

function getRedis() {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
        throw new Error("Falta configurar UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN.");
    }
    return Redis.fromEnv();
}

function getWebPush() {
    const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
    const { VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
        throw new Error("Faltan la clave pública VAPID, VAPID_PRIVATE_KEY o VAPID_SUBJECT.");
    }

    let subject;
    try {
        subject = new URL(VAPID_SUBJECT);
    } catch {
        throw new Error("VAPID_SUBJECT debe ser una URL https:// o un correo mailto: válido.");
    }
    if (!["https:", "mailto:"].includes(subject.protocol)) {
        throw new Error("VAPID_SUBJECT debe ser una URL https:// o un correo mailto: válido.");
    }

    if (!/^[A-Za-z0-9_-]+$/.test(VAPID_PUBLIC_KEY)) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY debe ser una clave Base64URL sin prefijo ni padding.");
    }
    const configuredPublicKey = Buffer.from(VAPID_PUBLIC_KEY, "base64url");
    if (configuredPublicKey.length !== 65 || configuredPublicKey[0] !== 4) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY no tiene el formato esperado (65 bytes Base64URL).");
    }

    if (!/^[A-Za-z0-9_-]+$/.test(VAPID_PRIVATE_KEY)) {
        throw new Error("VAPID_PRIVATE_KEY debe ser una clave Base64URL sin prefijo ni padding.");
    }
    const privateKey = Buffer.from(VAPID_PRIVATE_KEY, "base64url");
    if (privateKey.length !== 32) {
        throw new Error("VAPID_PRIVATE_KEY no tiene el formato esperado (32 bytes Base64URL).");
    }

    const ecdh = crypto.createECDH("prime256v1");
    try {
        ecdh.setPrivateKey(privateKey);
    } catch {
        throw new Error("VAPID_PRIVATE_KEY no es una clave válida para la curva P-256.");
    }
    const derivedPublicKey = ecdh.getPublicKey(null, "uncompressed");
    if (!crypto.timingSafeEqual(derivedPublicKey, configuredPublicKey)) {
        throw new Error("Las claves VAPID no corresponden: la clave pública no pertenece a esa clave privada.");
    }

    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    return webPush;
}

function getVapidPublicKey() {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
}

function hasValidSubscriptionShape(value) {
    if (!value || typeof value !== "object" || typeof value.endpoint !== "string"
        || value.endpoint.length > 2048 || typeof value.keys !== "object" || !value.keys) {
        return false;
    }

    try {
        const endpoint = new URL(value.endpoint);
        const allowedPushHosts = [
            "fcm.googleapis.com",
            "push.services.mozilla.com",
            "web.push.apple.com",
            "notify.windows.com"
        ];
        const trustedPushHost = allowedPushHosts.some((host) => {
            return endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`);
        });
        const validKey = (key, decodedLength) => {
            return typeof key === "string"
                && /^[A-Za-z0-9_-]+$/.test(key)
                && Buffer.from(key, "base64url").length === decodedLength;
        };
        return endpoint.protocol === "https:"
            && endpoint.port === ""
            && !endpoint.username
            && !endpoint.password
            && trustedPushHost
            && validKey(value.keys.p256dh, 65)
            && validKey(value.keys.auth, 16);
    } catch {
        return false;
    }
}

function subscriptionId(endpoint) {
    return crypto.createHash("sha256").update(endpoint).digest("hex");
}

function subscriptionRateLimitKey(request) {
    const forwardedFor = request.headers["x-forwarded-for"];
    const ipAddress = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : "unknown";
    const addressHash = crypto.createHash("sha256").update(ipAddress).digest("hex");
    return `biodomo:push:subscribe-rate:${addressHash}`;
}

function hasValidAdminToken(request) {
    const configuredToken = process.env.ADMIN_SECRET || process.env.PUSH_ADMIN_TOKEN;
    const authorization = request.headers.authorization || "";
    const suppliedToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

    if (!configuredToken || configuredToken.length < 32 || !suppliedToken) {
        return false;
    }

    const expected = Buffer.from(configuredToken);
    const actual = Buffer.from(suppliedToken);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = {
    SUBSCRIPTIONS_KEY,
    exceedsBodyLimit,
    getRedis,
    getWebPush,
    getVapidPublicKey,
    hasValidAdminToken,
    hasValidSubscriptionShape,
    readJsonBody,
    requireMethod,
    requireSameOrigin,
    sendJson,
    subscriptionId,
    subscriptionRateLimitKey
};
