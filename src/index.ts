import * as fs from 'fs';
import * as path from 'path';
import {
  apiKeyHandler,
  camelCaseHandler,
  connectToDatabase,
  healthCheckRoute,
  redisService,
  snakeCaseHandler,
} from '@config';
import { cors } from '@elysiajs/cors';
import { serverTiming } from '@elysiajs/server-timing';
import { staticPlugin } from '@elysiajs/static';
import categoryController from '@modules/category/controller.category';
import operatorController from '@modules/operator/controller.operator';
import resultController from '@modules/result/controller.result';
import templateController from '@modules/template/controller.template';
import { logger } from '@tqman/nice-logger';
import { miaw } from '@utils';
import { WebSocketController, type WebSocketConnection } from '@websockets';
import { config } from 'dotenv';
import { Elysia } from 'elysia';
import { elysiaHelmet } from 'elysiajs-helmet';

config();

void startServer();

async function startServer() {
  try {
    await connectToDatabase();

    try {
      await redisService.connect();
      console.log('Redis connected successfully');

      try {
        await redisService.flushAll();
        console.log('Redis cache cleaned up on startup');
      } catch (error) {
        console.warn('Failed to clean up Redis cache on startup:', error);
      }
    } catch (error) {
      console.warn('Redis connection failed, continuing with memory cache fallback:', error);
    }

    const wsController = new WebSocketController();
    const wsHandler = wsController.getHandler();

    const publicPath = path.resolve(process.cwd(), 'public');
    console.log(`Static files path: ${publicPath}`);
    console.log(`Public directory exists: ${fs.existsSync(publicPath)}`);

    const app = new Elysia()
      .use(
        logger({
          mode: 'combined',
          withTimestamp: false,
        }),
      )
      .use(elysiaHelmet({}))
      .use(serverTiming())
      .use(cors())
      .use(
        staticPlugin({
          assets: publicPath,
          prefix: '/',
        }),
      )
      .use(apiKeyHandler)
      .use(snakeCaseHandler)
      .use(camelCaseHandler)
      .use(healthCheckRoute)
      .use(categoryController)
      .use(operatorController)
      .use(resultController)
      .use(templateController)
      .use(wsController.createRoutes())
      .ws('/stats', {
        open: (ws: WebSocketConnection) => {
          void wsHandler.handleConnection(ws);
        },
        message: (ws: WebSocketConnection, message: string) => {
          void wsHandler.handleMessage(ws, message);
        },
        close: (ws: WebSocketConnection) => {
          wsHandler.handleDisconnection(ws);
        },
      })
      .get(
        '/',
        () =>
          new Response(miaw, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          }),
      )
      .get('/favicon.ico', () => new Response(null, { status: 204 }))
      .listen(3000);

    console.log(`Forge is running at ${app.server?.hostname}:${app.server?.port}`);
    console.log(`WebSocket available at ws://${app.server?.hostname}:${app.server?.port}/stats`);

    process.on('SIGINT', async () => {
      console.log('Shutting down gracefully...');
      wsHandler.cleanup();
      await redisService.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down gracefully...');
      wsHandler.cleanup();
      await redisService.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}
