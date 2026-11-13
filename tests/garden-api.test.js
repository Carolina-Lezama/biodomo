const test = require("node:test");
const assert = require("node:assert/strict");
const { Redis } = require("@upstash/redis");
const eventsHandler = require("../api/garden/events");
const plantsHandler = require("../api/garden/plants");
const readingsHandler = require("../api/garden/readings");
const { EVENTS_KEY, PLANTS_KEY, READINGS_KEY_PREFIX } = require("../server/garden");

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

const testAdminSecret = "t".repeat(40);

function request(method, body, query = {}, authorization = `Bearer ${testAdminSecret}`) {
    return {
        method,
        headers: {
            origin: "https://biodomo.example",
            "x-forwarded-host": "biodomo.example",
            authorization
        },
        body,
        query
    };
}

function createRedisMock() {
    const hashes = new Map();
    const lists = new Map();
    return {
        async hgetall(key) {
            return Object.fromEntries(hashes.get(key) || []);
        },
        async hget(key, id) {
            return (hashes.get(key) || new Map()).get(id) || null;
        },
        async hlen(key) {
            return (hashes.get(key) || new Map()).size;
        },
        async hset(key, values) {
            const hash = hashes.get(key) || new Map();
            Object.entries(values).forEach(([field, value]) => hash.set(field, value));
            hashes.set(key, hash);
        },
        async hdel(key, field) {
            hashes.get(key)?.delete(field);
        },
        async del(key) {
            lists.delete(key);
        },
        async lpush(key, value) {
            const list = lists.get(key) || [];
            list.unshift(value);
            lists.set(key, list);
        },
        async ltrim(key, start, end) {
            const list = lists.get(key) || [];
            lists.set(key, list.slice(start, end + 1));
        },
        async lrange(key, start, end) {
            return (lists.get(key) || []).slice(start, end + 1);
        }
    };
}

function configureRedis(t, redis) {
    const previousEnv = {
        ADMIN_SECRET: process.env.ADMIN_SECRET,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN
    };
    const previousFromEnv = Redis.fromEnv;
    process.env.ADMIN_SECRET = testAdminSecret;
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    Redis.fromEnv = () => redis;
    t.after(() => {
        Object.entries(previousEnv).forEach(([name, value]) => {
            if (value === undefined) delete process.env[name];
            else process.env[name] = value;
        });
        Redis.fromEnv = previousFromEnv;
    });
}

test("garden API creates plants, records readings, updates, and deletes their data", async (t) => {
    const redis = createRedisMock();
    configureRedis(t, redis);

    const plantCreateResponse = createResponse();
    await plantsHandler(request("POST", {
        name: "Albahaca",
        species: "Ocimum basilicum",
        location: "Cocina"
    }), plantCreateResponse);
    assert.equal(plantCreateResponse.statusCode, 201);
    assert.equal(plantCreateResponse.body.plant.status, "germinacion");
    const plantId = plantCreateResponse.body.plant.id;

    const readingCreateResponse = createResponse();
    await readingsHandler(request("POST", {
        plantId,
        temperatureC: 22.5,
        humidity: 60,
        ph: 6.4,
        lightLux: 800
    }), readingCreateResponse);
    assert.equal(readingCreateResponse.statusCode, 201);

    const listResponse = createResponse();
    await readingsHandler(request("GET", undefined, { plantId }), listResponse);
    assert.equal(listResponse.statusCode, 200);
    assert.equal(listResponse.body.readings.length, 1);
    assert.equal(listResponse.body.readings[0].ph, 6.4);

    const updateResponse = createResponse();
    await plantsHandler(request("PATCH", { wateredNow: true }, { id: plantId }), updateResponse);
    assert.equal(updateResponse.statusCode, 200);
    assert.ok(updateResponse.body.plant.wateredAt);

    const plantDeleteResponse = createResponse();
    await plantsHandler(request("DELETE", undefined, { id: plantId }), plantDeleteResponse);
    assert.equal(plantDeleteResponse.statusCode, 200);
    assert.equal(plantDeleteResponse.body.deleted, true);
    assert.equal(await redis.hget(PLANTS_KEY, plantId), null);
    assert.deepEqual(await redis.lrange(`${READINGS_KEY_PREFIX}${plantId}`, 0, 49), []);
});

test("garden API rejects missing credentials and out-of-range readings", async (t) => {
    const redis = createRedisMock();
    configureRedis(t, redis);

    const unauthorizedResponse = createResponse();
    await plantsHandler(request("GET", undefined, {}, "Bearer invalid"), unauthorizedResponse);
    assert.equal(unauthorizedResponse.statusCode, 401);

    const plantCreateResponse = createResponse();
    await plantsHandler(request("POST", {
        name: "Tomate",
        species: "Solanum lycopersicum",
        location: "Balcón"
    }), plantCreateResponse);
    const invalidReadingResponse = createResponse();
    await readingsHandler(request("POST", {
        plantId: plantCreateResponse.body.plant.id,
        temperatureC: 22,
        humidity: 101,
        ph: 6,
        lightLux: 500
    }), invalidReadingResponse);
    assert.equal(invalidReadingResponse.statusCode, 400);
});

test("garden GET accepts same-origin browser requests without an Origin header", async (t) => {
    const redis = createRedisMock();
    configureRedis(t, redis);

    const sameOriginRequest = request("GET", undefined);
    delete sameOriginRequest.headers.origin;
    sameOriginRequest.headers.referer = "https://biodomo.example/huerto";
    const response = createResponse();
    await plantsHandler(sameOriginRequest, response);
    assert.equal(response.statusCode, 200);

    const fetchMetadataRequest = request("GET", undefined);
    delete fetchMetadataRequest.headers.origin;
    fetchMetadataRequest.headers["sec-fetch-site"] = "same-origin";
    const fetchMetadataResponse = createResponse();
    await plantsHandler(fetchMetadataRequest, fetchMetadataResponse);
    assert.equal(fetchMetadataResponse.statusCode, 200);

    const crossOriginRequest = request("GET", undefined);
    delete crossOriginRequest.headers.origin;
    crossOriginRequest.headers.referer = "https://other.example/huerto";
    const crossOriginResponse = createResponse();
    await plantsHandler(crossOriginRequest, crossOriginResponse);
    assert.equal(crossOriginResponse.statusCode, 403);
});

test("garden event log persists activities separately and retains plant name as history", async (t) => {
    const redis = createRedisMock();
    configureRedis(t, redis);

    const plantResponse = createResponse();
    await plantsHandler(request("POST", {
        name: "Menta",
        species: "Mentha",
        location: "Ventana"
    }), plantResponse);
    const plantId = plantResponse.body.plant.id;

    const eventResponse = createResponse();
    await eventsHandler(request("POST", {
        plantId,
        eventType: "cosecha",
        note: "Corté las hojas maduras",
        occurredAt: "2026-11-12T12:00:00.000Z"
    }), eventResponse);
    assert.equal(eventResponse.statusCode, 201);
    assert.equal(eventResponse.body.event.plantName, "Menta");
    assert.notEqual(EVENTS_KEY, PLANTS_KEY);
    assert.notEqual(EVENTS_KEY, `${READINGS_KEY_PREFIX}${plantId}`);

    const filteredEventsResponse = createResponse();
    await eventsHandler(request("GET", undefined, { plantId }), filteredEventsResponse);
    assert.equal(filteredEventsResponse.statusCode, 200);
    assert.equal(filteredEventsResponse.body.events.length, 1);
    assert.equal(filteredEventsResponse.body.events[0].eventType, "cosecha");

    const deletePlantResponse = createResponse();
    await plantsHandler(request("DELETE", undefined, { id: plantId }), deletePlantResponse);
    const historicalEventsResponse = createResponse();
    await eventsHandler(request("GET"), historicalEventsResponse);
    assert.equal(historicalEventsResponse.body.events.length, 1);
    assert.equal(historicalEventsResponse.body.events[0].plantName, "Menta");
});

test("garden event log rejects unsupported activity types", async (t) => {
    const redis = createRedisMock();
    configureRedis(t, redis);
    const plantResponse = createResponse();
    await plantsHandler(request("POST", {
        name: "Tomillo",
        species: "Thymus vulgaris",
        location: "Balcón"
    }), plantResponse);

    const eventResponse = createResponse();
    await eventsHandler(request("POST", {
        plantId: plantResponse.body.plant.id,
        eventType: "alerta",
        note: "Actividad no soportada"
    }), eventResponse);
    assert.equal(eventResponse.statusCode, 400);
});
