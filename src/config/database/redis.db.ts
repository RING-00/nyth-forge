import { createClient, type RedisClientType } from 'redis';

export interface RedisConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  cacheTtl: number;
}

export class RedisService {
  private static instance: RedisService | null = null;
  private client: RedisClientType | null = null;
  private config: RedisConfig;
  private isConnected = false;

  private constructor() {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      username: process.env.REDIS_USERNAME || 'default',
      password: process.env.REDIS_PASSWORD || '',
      cacheTtl: parseInt(process.env.REDIS_CACHE_TTL || '30000', 10),
    };
  }

  public static getInstance(): RedisService {
    if (!RedisService.instance) {
      RedisService.instance = new RedisService();
    }
    return RedisService.instance;
  }

  public async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      return;
    }

    try {
      this.client = createClient({
        username: this.config.username,
        password: this.config.password,
        socket: {
          host: this.config.host,
          port: this.config.port,
        },
      });

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('Redis Client Disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  private ensureConnection(): RedisClientType {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  public async set(key: string, value: string, ttlMs?: number): Promise<void> {
    const client = this.ensureConnection();
    const ttl = ttlMs || this.config.cacheTtl;
    await client.setEx(key, Math.floor(ttl / 1000), value);
  }

  public async get(key: string): Promise<string | null> {
    const client = this.ensureConnection();
    return await client.get(key);
  }

  public async del(key: string): Promise<void> {
    const client = this.ensureConnection();
    await client.del(key);
  }

  public async exists(key: string): Promise<boolean> {
    const client = this.ensureConnection();
    const result = await client.exists(key);
    return result === 1;
  }

  public async ttl(key: string): Promise<number> {
    const client = this.ensureConnection();
    return await client.ttl(key);
  }

  public async flushAll(): Promise<void> {
    const client = this.ensureConnection();
    await client.flushAll();
  }

  public async keys(pattern: string = '*'): Promise<string[]> {
    const client = this.ensureConnection();
    return await client.keys(pattern);
  }

  public async type(key: string): Promise<string> {
    const client = this.ensureConnection();
    return await client.type(key);
  }

  public async getRawValue(key: string): Promise<string | null> {
    const client = this.ensureConnection();
    return await client.get(key);
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public getConfig(): RedisConfig {
    return { ...this.config };
  }
}

export const redisService = RedisService.getInstance();
