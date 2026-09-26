// Local development only: routes the @neondatabase/serverless driver through
// a local WebSocket relay so it can talk to a plain Postgres (see
// ../LOCAL_DEV.md). A no-op unless LOCAL_WS_RELAY is set.
import { neonConfig } from '@neondatabase/serverless';

const relay = process.env.LOCAL_WS_RELAY;
if (relay) {
  neonConfig.wsProxy = (host, port) => `${relay}/v1?address=${host}:${port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.forceDisablePgSSL = true;
  neonConfig.pipelineConnect = false;
}
