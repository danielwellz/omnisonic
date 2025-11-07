import Redis from "ioredis";

type AsyncResolver<T> = (value: IteratorResult<T>) => void;

export interface PubSub {
  publish<T>(topic: string, payload: T): Promise<void>;
  subscribe<T>(topic: string): AsyncIterableIterator<T>;
  close(): Promise<void>;
}

interface PubSubOptions {
  url?: string;
}

interface MemorySubscription<T> extends AsyncIterableIterator<T> {
  push(value: T): void;
  close(): void;
}

function createMemorySubscription<T>(): MemorySubscription<T> {
  const queue: T[] = [];
  const resolvers: AsyncResolver<T>[] = [];
  let closed = false;

  const iterator: MemorySubscription<T> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (queue.length > 0) {
        const value = queue.shift()!;
        return Promise.resolve({ value, done: false });
      }
      if (closed) {
        return Promise.resolve({ value: undefined, done: true });
      }
      return new Promise<IteratorResult<T>>((resolve) => {
        resolvers.push(resolve);
      });
    },
    return() {
      closed = true;
      while (resolvers.length) {
        const resolve = resolvers.shift()!;
        resolve({ value: undefined, done: true });
      }
      return Promise.resolve({ value: undefined, done: true });
    },
    throw(error) {
      closed = true;
      while (resolvers.length) {
        const resolve = resolvers.shift()!;
        resolve(Promise.reject(error) as unknown as IteratorResult<T>);
      }
      return Promise.reject(error);
    },
    push(value: T) {
      if (closed) return;
      if (resolvers.length > 0) {
        const resolve = resolvers.shift()!;
        resolve({ value, done: false });
      } else {
        queue.push(value);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      while (resolvers.length) {
        const resolve = resolvers.shift()!;
        resolve({ value: undefined, done: true });
      }
    }
  };

  return iterator;
}

function createMemoryPubSub(): PubSub {
  const topics = new Map<string, Set<MemorySubscription<unknown>>>();

  return {
    async publish<T>(topic: string, payload: T) {
      const subscribers = topics.get(topic);
      if (!subscribers) return;
      for (const sub of subscribers) {
        (sub as MemorySubscription<T>).push(payload);
      }
    },
    subscribe<T>(topic: string): AsyncIterableIterator<T> {
      const sub = createMemorySubscription<T>();
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

function createRedisIterator<T>(client: Redis, topic: string): AsyncIterableIterator<T> {
  const queue: T[] = [];
  const resolvers: AsyncResolver<T>[] = [];
  let active = true;

  const push = (value: T) => {
    if (!active) return;
    if (resolvers.length > 0) {
      const resolve = resolvers.shift()!;
      resolve({ value, done: false });
    } else {
      queue.push(value);
    }
  };

  const cleanup = async () => {
    if (!active) return;
    active = false;
    try {
      await client.unsubscribe(topic);
      await client.quit();
    } catch (error) {
      console.warn("Failed to clean up Redis pubsub client", error);
    }
    while (resolvers.length) {
      const resolve = resolvers.shift()!;
      resolve({ value: undefined, done: true });
    }
  };

  client.on("message", (_channel, message) => {
    try {
      const parsed = JSON.parse(message) as T;
      push(parsed);
    } catch (error) {
      console.warn("Failed to parse pubsub payload", error);
    }
  });

  const iterator: AsyncIterableIterator<T> = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      if (!active) {
        return Promise.resolve({ value: undefined, done: true });
      }
      if (queue.length > 0) {
        const value = queue.shift()!;
        return Promise.resolve({ value, done: false });
      }
      return new Promise<IteratorResult<T>>((resolve) => {
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

function createRedisPubSub(url: string): PubSub {
  const publisher = new Redis(url, { maxRetriesPerRequest: null });

  return {
    async publish<T>(topic: string, payload: T) {
      await publisher.publish(topic, JSON.stringify(payload));
    },
    subscribe<T>(topic: string) {
      const subscriber = new Redis(url, { maxRetriesPerRequest: null });
      const iterator = createRedisIterator<T>(subscriber, topic);
      void subscriber.subscribe(topic);
      return iterator;
    },
    async close() {
      await publisher.quit();
    }
  };
}

export function createPubSub(options: PubSubOptions = {}): PubSub {
  const url = options.url ?? process.env.PUBSUB_URL ?? process.env.REDIS_URL ?? "redis://localhost:6379";
  if (url === "memory") {
    return createMemoryPubSub();
  }
  return createRedisPubSub(url);
}

export * from "./topics";
