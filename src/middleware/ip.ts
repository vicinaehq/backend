import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '@/types/app.js';

/**
 * Middleware to extract and store the real client IP in context.
 * Checks headers set by reverse proxies (Caddy, Cloudflare, etc.)
 * IPs are only kept in RAM in order to avoid counting a download twice.
 */
export const ipMiddleware = (): MiddlewareHandler<AppContext> => {
	return async (c, next) => {
		// Try X-Forwarded-For first (set by Caddy and most reverse proxies)
		// Take the first IP in the chain (original client)
		const forwardedFor = c.req.header('X-Forwarded-For');
		if (forwardedFor) {
			c.set('clientIp', forwardedFor.split(',')[0].trim());
			await next();
			return;
		}

		// Try X-Real-IP (also set by Caddy)
		const realIp = c.req.header('X-Real-IP');
		if (realIp) {
			c.set('clientIp', realIp);
			await next();
			return;
		}

		// Try CF-Connecting-IP (Cloudflare)
		const cfIp = c.req.header('CF-Connecting-IP');
		if (cfIp) {
			c.set('clientIp', cfIp);
			await next();
			return;
		}

		// Try True-Client-IP (Cloudflare Enterprise)
		const trueClientIp = c.req.header('True-Client-IP');
		if (trueClientIp) {
			c.set('clientIp', trueClientIp);
			await next();
			return;
		}

		// Fallback to unknown
		c.set('clientIp', 'unknown');
		await next();
	};
};
