import * as fs from 'fs';
import * as path from 'path';
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import categoryController from '@modules/category/controller.category';
import operatorController from '@modules/operator/controller.operator';
import resultController from '@modules/result/controller.result';
import templateController from '@modules/template/controller.template';
import { logger } from '@tqman/nice-logger';
import { miaw } from '@utils';
import { config } from 'dotenv';
import { Elysia } from 'elysia';
import { apiKeyHandler, camelCaseHandler, connectToDatabase, healthCheckRoute, snakeCaseHandler } from './config';
import { WebSocketController, type WebSocketConnection } from './websockets';

config();

void startServer();

async function startServer() {
  try {
    await connectToDatabase();

    const wsController = new WebSocketController();
    const wsHandler = wsController.getHandler();

    const publicPath = path.resolve(process.cwd(), 'public');
    console.log(`Static files path: ${publicPath}`);
    console.log(`Public directory exists: ${fs.existsSync(publicPath)}`);

    const waguriPath = path.join(publicPath, 'waguri.gif');
    console.log(`Waguri.gif path: ${waguriPath}`);
    console.log(`Waguri.gif exists: ${fs.existsSync(waguriPath)}`);

    const app = new Elysia()
      .use(cors())
      .use(
        staticPlugin({
          assets: publicPath,
          prefix: '/',
        }),
      )
      .use(
        logger({
          mode: 'combined',
          withTimestamp: false,
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
      .get('/test-image', () => {
        return new Response('Image test: <img src="/waguri.gif" alt="test" />', {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        });
      })
      .get('/waguri.gif', () => {
        try {
          const waguriPath = path.join(publicPath, 'waguri.gif');
          if (fs.existsSync(waguriPath)) {
            const file = Bun.file(waguriPath);
            return new Response(file, {
              headers: {
                'Content-Type': 'image/gif',
                'Cache-Control': 'public, max-age=31536000',
              },
            });
          } else {
            console.error(`Waguri.gif not found at: ${waguriPath}`);
            return new Response('Image not found', { status: 404 });
          }
        } catch (error) {
          console.error('Error serving waguri.gif:', error);
          return new Response('Internal server error', { status: 500 });
        }
      })
      .get('/favicon.ico', () => new Response(null, { status: 204 }))
      .listen(3000);

    console.log(`Forge is running at ${app.server?.hostname}:${app.server?.port}`);
    console.log(`WebSocket available at ws://${app.server?.hostname}:${app.server?.port}/stats`);

    process.on('SIGINT', () => {
      console.log('Shutting down gracefully...');
      wsHandler.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('Shutting down gracefully...');
      wsHandler.cleanup();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}
