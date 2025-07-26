import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import categoryController from '@modules/category/controller.category';
import operatorController from '@modules/operator/controller.operator';
import resultController from '@modules/result/controller.result';
import templateController from '@modules/template/controller.template';
import { miaw } from '@utils';
import { config } from 'dotenv';
import { Elysia } from 'elysia';
import logixlysia from 'logixlysia';
import { apiKeyHandler, camelCaseHandler, connectToDatabase, healthCheckRoute, snakeCaseHandler } from './config';
import { WebSocketController, type WebSocketConnection } from './websockets';

config();

void startServer();

async function startServer() {
  try {
    await connectToDatabase();

    const wsController = new WebSocketController();
    const wsHandler = wsController.getHandler();

    const app = new Elysia()
      .use(cors())
      .use(
        staticPlugin({
          assets: 'public',
          prefix: '/',
        }),
      )
      .use(
        logixlysia({
          config: {
            showStartupMessage: false,
            ip: true,
            customLogFormat: '{status} {method} {pathname} {duration} {message} {ip}',
          },
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
