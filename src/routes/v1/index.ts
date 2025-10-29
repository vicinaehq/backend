import { Hono } from 'hono';
import { createStorageFromEnv, LocalStorageAdapter } from '../../storage/index.js';
import type { AppContext } from '../../types/app.js';
import storeRouter from './store.js'
import localStorageRouter from '../storage.js'

const storage = createStorageFromEnv();
const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

const v1 = new Hono<AppContext>()

// Inject shared context variables
v1.use('*', async (c, next) => {
  c.set('baseUrl', `${baseUrl}/v1`)
  await next()

})

v1.route('/store', storeRouter)

if (storage instanceof LocalStorageAdapter) {
	v1.route('/', localStorageRouter);
}

export default v1;

