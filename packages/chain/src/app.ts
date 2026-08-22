/**
 * Fastify app factory for Part 3 — exported so tests can build it without
 * binding a port. Builds the full service: /health, /deals.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { registerDealsRoutes } from './deals.js';
import { registerErc8004Routes } from './erc8004Routes.js';
import type { SafetyPolicy } from './safety.js';

export interface BuildAppOptions {
  policy?: SafetyPolicy;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  // Add response hook to debug all responses
  app.addHook('onSend', async (request, reply, payload) => {
    console.log('[Fastify onSend] Response sent:', {
      url: request.url,
      method: request.method,
      statusCode: reply.statusCode,
      contentType: reply.getHeader('content-type'),
      payloadLength: typeof payload === 'string' ? payload.length : Buffer.byteLength(payload as string)
    });
    return payload;
  });

  await app.register(cors);

  app.get('/health', async () => ({ ok: true }));

  registerDealsRoutes(app, opts);
  registerErc8004Routes(app);

  return app;
}