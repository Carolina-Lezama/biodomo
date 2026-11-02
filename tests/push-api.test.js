const test = require("node:test");
const assert = require("node:assert/strict");
const configHandler = require("../api/push/config");
const sendHandler = require("../api/push/send");
const subscribeHandler = require("../api/push/subscribe");
const { Redis } = require("@upstash/redis");
const webPush = require("web-push");
const { hasValidAdminToken, hasValidSubscriptionShape } = require("../server/push");

function createResponse() {
    return {
        headers: {},
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
        },
        end(body) {
            this.body = body ? JSON.parse(body) : undefined;
        }
    };
}

function request(method, headers = {}, body) {
    return { method, headers, body };
}

test("push configuration refuses to expose a partial setup", async (t) => {
    const names = [
        "VAPID_PUBLIC_KEY",
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        "VAPID_PRIVATE_KEY",
        "VAPID_SUBJECT",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "PUSH_ADMIN_TOKEN",
        "ADMIN_SECRET"
    ];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    t.after(() => names.forEach((name) => {
        if (previous[name] === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = previous[name];
        }
    }));
    names.forEach((name) => delete process.env[name]);

    const response = createResponse();
    await configHandler(request("GET"), response);
    assert.equal(response.statusCode, 503);
    assert.match(response.body.error, /NEXT_PUBLIC_VAPID_PUBLIC_KEY/);
    assert.match(response.body.error, /ADMIN_SECRET/);
    assert.equal(response.body.privateKey, undefined);
});

test("push configuration returns only the public key when all settings are valid", async (t) => {
    const names = [
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        "VAPID_PRIVATE_KEY",
        "VAPID_SUBJECT",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN",
        "ADMIN_SECRET"
    ];
    const previousEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const previousFromEnv = Redis.fromEnv;
    const keys = webPush.generateVAPIDKeys();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "private-redis-token";
    process.env.ADMIN_SECRET = "a".repeat(40);
    Redis.fromEnv = () => ({});
    t.after(() => {
        names.forEach((name) => {
            if (previousEnv[name] === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = previousEnv[name];
            }
        });
        Redis.fromEnv = previousFromEnv;
    });

    const response = createResponse();
    await configHandler(request("GET"), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { publicKey: keys.publicKey });
    assert.equal(JSON.stringify(response.body).includes(keys.privateKey), false);
    assert.equal(JSON.stringify(response.body).includes(process.env.UPSTASH_REDIS_REST_TOKEN), false);
    assert.equal(response.headers["Cache-Control"], "no-store");
});

test("push send rejects invalid admin credentials before contacting Redis", async (t) => {
    const previous = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = "a".repeat(40);
    t.after(() => {
        if (previous === undefined) {
            delete process.env.ADMIN_SECRET;
        } else {
            process.env.ADMIN_SECRET = previous;
        }
    });

    const response = createResponse();
    await sendHandler(request("POST", {
        origin: "https://biodomo.example",
        "x-forwarded-host": "biodomo.example",
        authorization: "Bearer wrong"
    }, { title: "Test", message: "Body" }), response);
    assert.equal(response.statusCode, 401);
});

test("push send delivers to stored subscriptions and reports totals", async (t) => {
    const envNames = [
        "ADMIN_SECRET",
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
        "VAPID_PRIVATE_KEY",
        "VAPID_SUBJECT",
        "UPSTASH_REDIS_REST_URL",
        "UPSTASH_REDIS_REST_TOKEN"
    ];
    const previousEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
    const generatedKeys = webPush.generateVAPIDKeys();
    const subscription = {
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: {
            p256dh: Buffer.alloc(65, 1).toString("base64url"),
            auth: Buffer.alloc(16, 2).toString("base64url")
        }
    };
    const previousFromEnv = Redis.fromEnv;
    const previousSendNotification = webPush.sendNotification;
    process.env.ADMIN_SECRET = "a".repeat(40);
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = generatedKeys.publicKey;
    process.env.VAPID_PRIVATE_KEY = generatedKeys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@example.com";
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    Redis.fromEnv = () => ({
        hgetall: async () => ({ device: JSON.stringify(subscription) })
    });
    webPush.sendNotification = async () => ({ statusCode: 201 });
    t.after(() => {
        envNames.forEach((name) => {
            if (previousEnv[name] === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = previousEnv[name];
            }
        });
        Redis.fromEnv = previousFromEnv;
        webPush.sendNotification = previousSendNotification;
    });

    const response = createResponse();
    await sendHandler(request("POST", {
        origin: "https://biodomo.example",
        "x-forwarded-host": "biodomo.example",
        authorization: `Bearer ${process.env.ADMIN_SECRET}`
    }, { title: "Test", message: "Body" }), response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, { sent: 1, failed: 0, total: 1 });
    assert.equal(hasValidAdminToken({
        headers: { authorization: `Bearer ${process.env.ADMIN_SECRET}` }
    }), true);
});

test("push subscription rejects cross-origin requests", async () => {
    const response = createResponse();
    await subscribeHandler(request("POST", {
        origin: "https://attacker.example",
        "x-forwarded-host": "biodomo.example"
    }, {}), response);
    assert.equal(response.statusCode, 403);
});

test("push subscription validates secure endpoints and encryption keys", () => {
    const p256dh = Buffer.alloc(65, 1).toString("base64url");
    const auth = Buffer.alloc(16, 2).toString("base64url");
    assert.equal(hasValidSubscriptionShape({
        endpoint: "https://fcm.googleapis.com/fcm/send/test",
        keys: { p256dh, auth }
    }), true);
    assert.equal(hasValidSubscriptionShape({
        endpoint: "http://push.example/endpoint",
        keys: { p256dh, auth }
    }), false);
    assert.equal(hasValidSubscriptionShape({
        endpoint: "https://unknown.example/endpoint",
        keys: { p256dh, auth }
    }), false);
});
