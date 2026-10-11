import { Throttle } from '@nestjs/throttler';

/**
 * Stricter rate limit for endpoints that check passwords, 2FA codes or activation tokens:
 * AUTH_RATE_LIMIT_PER_MINUTE requests per minute (default 20), per IP address, per endpoint.
 * Every other route gets the general limit set in AppModule.
 *
 * Read on each request rather than at startup, so it always reflects .env.
 * Behind a proxy or load balancer, set TRUST_PROXY so the limit applies to the real client IP.
 */
export const AuthRateLimit = () =>
  Throttle({
    default: {
      limit: () => Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 20),
      ttl: 60_000,
    },
  });
