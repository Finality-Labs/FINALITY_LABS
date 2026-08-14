import Fastify from "fastify";
import cors from "@fastify/cors";
import { Store } from "./store";
import { Matchmaker } from "./matchmaker";
import { registerRoutes } from "./routes";
import { seed } from "./seed";
import { PulseService } from "./pulse";

export function buildApp(opts: { seedFixtures?: boolean } = {}) {
  const app = Fastify({ logger: false });
  app.register(cors, { origin: true });

  const store = new Store();
  const matchmaker = new Matchmaker(store);
  const pulse = new PulseService(store, matchmaker);
  registerRoutes(app, store, matchmaker, pulse);

  // Seed the artifact's example cast so a match is demonstrable on boot.
  // Tests that need a clean store can opt out via { seedFixtures: false }.
  if (opts.seedFixtures !== false) {
    seed(store);
  }

  return app;
}
