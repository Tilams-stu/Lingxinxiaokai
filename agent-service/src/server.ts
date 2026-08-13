import { createService } from './service.js';

const host = process.env.AGENT_HOST ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') throw new Error('AGENT_HOST must be loopback-only');
const port = Number(process.env.AGENT_PORT ?? 8787);
createService().listen(port, host, () => console.log(`Pi agent service listening on ${host}:${port}`));
