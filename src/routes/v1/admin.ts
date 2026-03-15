import { Hono } from 'hono';
import type { AppContext } from '@/types/app.js';
import { prisma } from '@/db.js';

const admin = new Hono<AppContext>();

admin.use('*', async (c, next) => {
	if (!c.get('authenticated')) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
});

admin.get('/telemetry/system-info', async (c) => {
	const limit = Math.min(Number(c.req.query('limit') || 100), 500);
	const offset = Number(c.req.query('offset') || 0);

	const rows = await prisma.telemetrySystemInfo.findMany({
		orderBy: { createdAt: 'desc' },
		take: limit,
		skip: offset,
	});

	return c.json({
		data: rows.map((r) => ({
			...r,
			desktops: JSON.parse(r.desktops),
			screens: JSON.parse(r.screens),
		})),
		limit,
		offset,
	});
});

const GRANULARITIES = ['daily', 'weekly', 'monthly', 'yearly'] as const;
type Granularity = typeof GRANULARITIES[number];

function mondayOfWeek(date: Date): string {
	const d = new Date(date);
	const day = d.getUTCDay();
	const diff = day === 0 ? -6 : 1 - day;
	d.setUTCDate(d.getUTCDate() + diff);
	return d.toISOString().slice(0, 10);
}

function bucketKey(date: Date, granularity: Granularity): string {
	const iso = date.toISOString();
	switch (granularity) {
		case 'daily': return iso.slice(0, 10);
		case 'weekly': return mondayOfWeek(date);
		case 'monthly': return iso.slice(0, 7) + '-01';
		case 'yearly': return iso.slice(0, 4) + '-01-01';
	}
}

admin.get('/telemetry/system-info/stats', async (c) => {
	const granularity = (c.req.query('granularity') || 'daily') as Granularity;
	if (!GRANULARITIES.includes(granularity)) {
		return c.json({ error: `Invalid granularity. Must be one of: ${GRANULARITIES.join(', ')}` }, 400);
	}

	const periods = Math.min(Number(c.req.query('periods') || 30), 365);
	const since = new Date();
	switch (granularity) {
		case 'daily': since.setDate(since.getDate() - periods); break;
		case 'weekly': since.setDate(since.getDate() - periods * 7); break;
		case 'monthly': since.setMonth(since.getMonth() - periods); break;
		case 'yearly': since.setFullYear(since.getFullYear() - periods); break;
	}

	const rows = await prisma.telemetrySystemInfo.findMany({
		where: { date: { gte: since } },
		orderBy: { date: 'desc' },
	});

	const buckets = new Map<string, {
		activeUsers: Set<string>;
		operatingSystems: Map<string, number>;
		architectures: Map<string, number>;
		versions: Map<string, number>;
		displayProtocols: Map<string, number>;
		chassisTypes: Map<string, number>;
	}>();

	for (const row of rows) {
		const key = bucketKey(row.date, granularity);
		if (!buckets.has(key)) {
			buckets.set(key, {
				activeUsers: new Set(),
				operatingSystems: new Map(),
				architectures: new Map(),
				versions: new Map(),
				displayProtocols: new Map(),
				chassisTypes: new Map(),
			});
		}
		const bucket = buckets.get(key)!;
		bucket.activeUsers.add(row.userId);
		bucket.operatingSystems.set(row.operatingSystem, (bucket.operatingSystems.get(row.operatingSystem) || 0) + 1);
		bucket.architectures.set(row.architecture, (bucket.architectures.get(row.architecture) || 0) + 1);
		bucket.versions.set(row.vicinaeVersion, (bucket.versions.get(row.vicinaeVersion) || 0) + 1);
		bucket.displayProtocols.set(row.displayProtocol, (bucket.displayProtocols.get(row.displayProtocol) || 0) + 1);
		bucket.chassisTypes.set(row.chassisType, (bucket.chassisTypes.get(row.chassisType) || 0) + 1);
	}

	const data = [...buckets.entries()].map(([period, bucket]) => ({
		period,
		activeUsers: bucket.activeUsers.size,
		operatingSystems: Object.fromEntries(bucket.operatingSystems),
		architectures: Object.fromEntries(bucket.architectures),
		versions: Object.fromEntries(bucket.versions),
		displayProtocols: Object.fromEntries(bucket.displayProtocols),
		chassisTypes: Object.fromEntries(bucket.chassisTypes),
	}));

	return c.json({ data, granularity, periods });
});

export default admin;
