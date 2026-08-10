/**
 * Part 3 entry point. Listens on PORT (default 3003) and serves the chain
 * settlement service: GET /health, POST /deals.
 */

import { buildApp } from './app.js';
import { evaluate, type SafetyPolicy, DEFAULT_POLICY } from './safety.js';

const PORT = Number(process.env.PORT ?? 3003);

// Only start the server if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    // eslint-disable-next-line no-console
    console.log(`[finality:chain] listening on :${PORT}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  }
}

// Re-export for other packages
export { evaluate, type SafetyPolicy, DEFAULT_POLICY };
export { buildApp };
