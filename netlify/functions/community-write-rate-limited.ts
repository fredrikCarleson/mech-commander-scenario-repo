import type { Config } from '@netlify/functions';
import handler from './api-v1.ts';

export default handler;

export const config: Config = {
  path: [
    '/api/v1/scenarios',
    '/api/v1/scenarios/:id',
    '/api/v1/scenarios/:id/ratings',
    '/api/v1/campaigns',
    '/api/v1/campaigns/:id',
    '/api/v1/campaigns/:id/ratings',
    '/api/v1/support',
    '/api/v1/support/:id',
    '/api/v1/support/:id/votes',
    '/api/v1/support/:id/status',
  ],
  method: ['POST', 'PUT'],
  rateLimit: {
    action: 'rewrite',
    to: '/api/v1/rate-limited',
    windowLimit: 20,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
