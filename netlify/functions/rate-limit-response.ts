import type { Config } from '@netlify/functions';
import { applyCors, errorResponse } from './lib/http.ts';

export default function handler(request: Request): Response {
  return applyCors(errorResponse(429, 'Too many requests. Please try again later.'), request);
}

export const config: Config = { path: '/api/v1/rate-limited' };
