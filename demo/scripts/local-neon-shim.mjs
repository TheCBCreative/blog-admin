// LOCAL DEVELOPMENT ONLY. Routes the @neondatabase/serverless driver through
// a local WebSocket relay (see ../LOCAL_DEV.md) so `npm run db:setup` /
// `db:seed` and `astro dev` can talk to a plain local Postgres instead of a
// real Neon endpoint. Never used in production — the deployed app talks to a
// real pooled Neon connection string directly.
import { neonConfig } from '@neondatabase/serverless';

const relay = process.env.LOCAL_WS_RELAY;
if (relay) {
  neonConfig.wsProxy = (host, port) => `${relay}/v1?address=${host}:${port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.forceDisablePgSSL = true;
  neonConfig.pipelineConnect = false;
}
