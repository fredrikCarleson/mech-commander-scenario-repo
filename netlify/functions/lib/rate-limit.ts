const UPLOAD_LIMIT = Number(process.env.UPLOAD_RATE_LIMIT ?? 10);
const UPLOAD_WINDOW_MS = Number(process.env.UPLOAD_RATE_WINDOW_MS ?? 60 * 60 * 1000);

type Bucket = {
  count: number;
  resetAt: number;
};

const uploadBuckets = new Map<string, Bucket>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return request.headers.get('x-nf-client-connection-ip') ?? 'unknown';
}

export function checkUploadRateLimit(request: Request): boolean {
  const ip = clientIp(request);
  const now = Date.now();
  const bucket = uploadBuckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    uploadBuckets.set(ip, { count: 1, resetAt: now + UPLOAD_WINDOW_MS });
    return true;
  }

  if (bucket.count >= UPLOAD_LIMIT) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export function resetRateLimitsForTests(): void {
  uploadBuckets.clear();
}
