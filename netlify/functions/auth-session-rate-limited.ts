import type { Config } from '@netlify/functions';
import handler from './api-v1.ts';

export default handler;

export const config: Config = {
  path: '/api/v1/auth/session',
  method: 'POST',
  rateLimit: {
    action: 'rewrite',
    to: '/api/v1/rate-limited',
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
