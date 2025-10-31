import type { MiddlewareHandler } from "hono";
import type { AppContext } from '@/types/app.js';

const API_SECRET = process.env.API_SECRET;

export const authMiddleware = (): MiddlewareHandler<AppContext> => {
	return async (c, next) => {
		const authorization = c.req.header('Authorization');
		const key = authorization?.split(' ')[1] ?? '';

		// check but don't block
		if (key !== API_SECRET) {
			if (key.length != 0) { console.warn(`Got invalid api secret: ${key}`); }
			c.set('authenticated', false);
			return next();
		}

		c.set('authenticated', true);
		return next();
	};
};
