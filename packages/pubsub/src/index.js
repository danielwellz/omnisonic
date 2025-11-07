import Redis from "ioredis";
function createMemorySubscription() {
    const queue = [];
    const resolvers = [];
    let closed = false;
    const iterator = {
        [Symbol.asyncIterator]() {
            return this;
        },
        next() {
            if (queue.length > 0) {
                const value = queue.shift();
                return Promise.resolve({ value, done: false });
            }
            if (closed) {
                return Promise.resolve({ value: undefined, done: true });
            }
            return new Promise((resolve) => {
                resolvers.push(resolve);
            });
        },
        return() {
            closed = true;
            while (resolvers.length) {
                const resolve = resolvers.shift();
                resolve({ value: undefined, done: true });
            }
            return Promise.resolve({ value: undefined, done: true });
        },
        throw(error) {
            closed = true;
            while (resolvers.length) {
                const resolve = resolvers.shift();
                resolve(Promise.reject(error));
            }
            return Promise.reject(error);
        },
        push(value) {
            if (closed)
                return;
            if (resolvers.length > 0) {
                const resolve = resolvers.shift();
                resolve({ value, done: false });
            }
            else {
                queue.push(value);
            }
        },
        close() {
            if (closed)
                return;
            closed = true;
            while (resolvers.length) {
                const resolve = resolvers.shift();
                resolve({ value: undefined, done: true });
            }
        }
    };
    return iterator;
}
function createMemoryPubSub() {
    const topics = new Map();
    return {
        async publish(topic, payload) {
            const subscribers = topics.get(topic);
            if (!subscribers)
                return;
            for (const sub of subscribers) {
                sub.push(payload);
            }
        },
        subscribe(topic) {
            const sub = createMemorySubscription();
            const entry = topics.get(topic) ?? new Set();
            entry.add(sub);
            topics.set(topic, entry);
            const originalReturn = sub.return?.bind(sub);
            sub.return = async () => {
                entry.delete(sub);
                if (entry.size === 0) {
                    topics.delete(topic);
                }
                sub.close();
                return originalReturn ? originalReturn() : { value: undefined, done: true };
            };
            return sub;
        },
        async close() {
            topics.clear();
        }
    };
}
function createRedisIterator(client, topic) {
    const queue = [];
    const resolvers = [];
    let active = true;
    const push = (value) => {
        if (!active)
            return;
        if (resolvers.length > 0) {
            const resolve = resolvers.shift();
            resolve({ value, done: false });
        }
        else {
            queue.push(value);
        }
    };
    const cleanup = async () => {
        if (!active)
            return;
        active = false;
        try {
            await client.unsubscribe(topic);
            await client.quit();
        }
        catch (error) {
            console.warn("Failed to clean up Redis pubsub client", error);
        }
        while (resolvers.length) {
            const resolve = resolvers.shift();
            resolve({ value: undefined, done: true });
        }
    };
    client.on("message", (_channel, message) => {
        try {
            const parsed = JSON.parse(message);
            push(parsed);
        }
        catch (error) {
            console.warn("Failed to parse pubsub payload", error);
        }
    });
    const iterator = {
        [Symbol.asyncIterator]() {
            return this;
        },
        next() {
            if (!active) {
                return Promise.resolve({ value: undefined, done: true });
            }
            if (queue.length > 0) {
                const value = queue.shift();
                return Promise.resolve({ value, done: false });
            }
            return new Promise((resolve) => {
                resolvers.push(resolve);
            });
        },
        async return() {
            await cleanup();
            return { value: undefined, done: true };
        },
        async throw(error) {
            await cleanup();
            throw error;
        }
    };
    return iterator;
}
function createRedisPubSub(url) {
    const publisher = new Redis(url, { maxRetriesPerRequest: null });
    return {
        async publish(topic, payload) {
            await publisher.publish(topic, JSON.stringify(payload));
        },
        subscribe(topic) {
            const subscriber = new Redis(url, { maxRetriesPerRequest: null });
            const iterator = createRedisIterator(subscriber, topic);
            void subscriber.subscribe(topic);
            return iterator;
        },
        async close() {
            await publisher.quit();
        }
    };
}
export function createPubSub(options = {}) {
    const url = options.url ?? process.env.PUBSUB_URL ?? process.env.REDIS_URL ?? "redis://localhost:6379";
    if (url === "memory") {
        return createMemoryPubSub();
    }
    return createRedisPubSub(url);
}
export * from "./topics";
