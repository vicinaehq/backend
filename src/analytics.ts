import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import type { SystemInfoPayload } from "@/schemas/telemetry.js";

const DB_PATH = process.env.ANALYTICS_DB_PATH || "./analytics.duckdb";

const SCHEMA_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS telemetry_system_info (
		user_id          VARCHAR NOT NULL,
		date             DATE NOT NULL,
		desktops         VARCHAR[] NOT NULL,
		vicinae_version  VARCHAR NOT NULL,
		display_protocol VARCHAR NOT NULL,
		architecture     VARCHAR NOT NULL,
		operating_system VARCHAR NOT NULL,
		build_provenance VARCHAR NOT NULL,
		locale           VARCHAR NOT NULL,
		screens          JSON NOT NULL,
		chassis_type     VARCHAR NOT NULL,
		kernel_version   VARCHAR NOT NULL,
		product_id       VARCHAR NOT NULL,
		product_version  VARCHAR NOT NULL,
		qt_version       VARCHAR,
		created_at       TIMESTAMP NOT NULL DEFAULT current_timestamp,
		updated_at       TIMESTAMP NOT NULL DEFAULT current_timestamp,
		PRIMARY KEY (user_id, date)
	)`,
];

let instance: DuckDBInstance;
let connection: Awaited<ReturnType<DuckDBInstance["connect"]>>;

export async function initAnalytics() {
	instance = await DuckDBInstance.create(DB_PATH);
	connection = await instance.connect();
	for (const stmt of SCHEMA_STATEMENTS) {
		await connection.run(stmt);
	}
}

export async function closeAnalytics() {
	connection?.closeSync();
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, async () => {
		await closeAnalytics();
	});
}
process.on("beforeExit", closeAnalytics);

function getConnection() {
	if (!connection) throw new Error("Analytics DB not initialized");
	return connection;
}

export async function upsertSystemInfo(
	data: SystemInfoPayload & { date: Date },
) {
	const conn = getConnection();
	const dateStr = data.date.toISOString().split("T")[0];

	const now = new Date().toISOString();
	await conn.run(
		`INSERT INTO telemetry_system_info (
			user_id, date, desktops, vicinae_version, display_protocol,
			architecture, operating_system, build_provenance, locale, screens,
			chassis_type, kernel_version, product_id, product_version, qt_version,
			created_at, updated_at
		) VALUES ($1, $2::DATE, $3::VARCHAR[], $4, $5, $6, $7, $8, $9, $10::JSON, $11, $12, $13, $14, $15, $16::TIMESTAMP, $16::TIMESTAMP)
		ON CONFLICT (user_id, date) DO UPDATE SET
			desktops = EXCLUDED.desktops,
			vicinae_version = EXCLUDED.vicinae_version,
			display_protocol = EXCLUDED.display_protocol,
			architecture = EXCLUDED.architecture,
			operating_system = EXCLUDED.operating_system,
			build_provenance = EXCLUDED.build_provenance,
			locale = EXCLUDED.locale,
			screens = EXCLUDED.screens,
			chassis_type = EXCLUDED.chassis_type,
			kernel_version = EXCLUDED.kernel_version,
			product_id = EXCLUDED.product_id,
			product_version = EXCLUDED.product_version,
			qt_version = EXCLUDED.qt_version,
			updated_at = EXCLUDED.updated_at`,
		{
			1: data.userId,
			2: dateStr,
			3: JSON.stringify(data.desktops),
			4: data.vicinaeVersion,
			5: data.displayProtocol,
			6: data.architecture,
			7: data.operatingSystem,
			8: data.buildProvenance,
			9: data.locale,
			10: JSON.stringify(data.screens),
			11: data.chassisType,
			12: data.kernelVersion,
			13: data.productId,
			14: data.productVersion,
			15: data.qtVersion ?? null,
			16: now,
		},
	);
}

export async function deleteUserData(userId: string) {
	const conn = getConnection();
	await conn.run(
		"DELETE FROM telemetry_system_info WHERE user_id = $1",
		{ 1: userId },
	);
}

export async function queryRawRows(limit: number, offset: number) {
	const conn = getConnection();
	const reader = await conn.runAndReadAll(
		`SELECT * FROM telemetry_system_info
		 ORDER BY created_at DESC
		 LIMIT $1 OFFSET $2`,
		{ 1: limit, 2: offset },
	);
	return reader.getRowObjectsJson();
}

const VALID_GRANULARITIES = ["daily", "weekly", "monthly", "yearly"] as const;
type Granularity = (typeof VALID_GRANULARITIES)[number];

const GRANULARITY_TO_TRUNC: Record<Granularity, string> = {
	daily: "day",
	weekly: "week",
	monthly: "month",
	yearly: "year",
};

function computeSince(granularity: Granularity, periods: number): string {
	const since = new Date();
	switch (granularity) {
		case "daily":
			since.setDate(since.getDate() - periods);
			break;
		case "weekly":
			since.setDate(since.getDate() - periods * 7);
			break;
		case "monthly":
			since.setMonth(since.getMonth() - periods);
			break;
		case "yearly":
			since.setFullYear(since.getFullYear() - periods);
			break;
	}
	return since.toISOString().split("T")[0];
}

const DIMENSION_COLUMNS = [
	{ key: "operatingSystems", column: "operating_system" },
	{ key: "architectures", column: "architecture" },
	{ key: "versions", column: "vicinae_version" },
	{ key: "displayProtocols", column: "display_protocol" },
	{ key: "chassisTypes", column: "chassis_type" },
	{ key: "productIds", column: "product_id" },
] as const;

async function breakdownByColumn(
	conn: ReturnType<typeof getConnection>,
	trunc: string,
	column: string,
	where: string,
	params: Record<string, DuckDBValue>,
): Promise<Map<string, Record<string, number>>> {
	const reader = await conn.runAndReadAll(
		`SELECT
			date_trunc('${trunc}', date)::DATE AS period,
			${column} AS value,
			COUNT(DISTINCT user_id) AS count
		FROM telemetry_system_info
		WHERE ${where}
		GROUP BY period, value
		ORDER BY period DESC`,
		params,
	);
	const result = new Map<string, Record<string, number>>();
	for (const row of reader.getRowObjects()) {
		const period = String(row.period);
		if (!result.has(period)) result.set(period, {});
		result.get(period)![String(row.value)] = Number(row.count);
	}
	return result;
}

async function breakdownByDesktop(
	conn: ReturnType<typeof getConnection>,
	trunc: string,
	where: string,
	params: Record<string, DuckDBValue>,
): Promise<Map<string, Record<string, number>>> {
	const reader = await conn.runAndReadAll(
		`SELECT
			date_trunc('${trunc}', date)::DATE AS period,
			desktop AS value,
			COUNT(DISTINCT user_id) AS count
		FROM (
			SELECT date, user_id, UNNEST(desktops) AS desktop
			FROM telemetry_system_info
			WHERE ${where}
		)
		GROUP BY period, value
		ORDER BY period DESC`,
		params,
	);
	const result = new Map<string, Record<string, number>>();
	for (const row of reader.getRowObjects()) {
		const period = String(row.period);
		if (!result.has(period)) result.set(period, {});
		result.get(period)![String(row.value)] = Number(row.count);
	}
	return result;
}

async function queryBreakdowns(
	trunc: string,
	where: string,
	params: Record<string, DuckDBValue>,
) {
	const conn = getConnection();

	const dauReader = await conn.runAndReadAll(
		`SELECT
			date_trunc('${trunc}', date)::DATE AS period,
			COUNT(DISTINCT user_id) AS active_users
		FROM telemetry_system_info
		WHERE ${where}
		GROUP BY period
		ORDER BY period DESC`,
		params,
	);

	const dimensions = await Promise.all(
		DIMENSION_COLUMNS.map(({ column }) =>
			breakdownByColumn(conn, trunc, column, where, params),
		),
	);
	const desktops = await breakdownByDesktop(conn, trunc, where, params);

	return dauReader.getRowObjects().map((row) => {
		const period = String(row.period);
		const breakdowns: Record<string, Record<string, number>> = {};
		for (let i = 0; i < DIMENSION_COLUMNS.length; i++) {
			breakdowns[DIMENSION_COLUMNS[i].key] = dimensions[i].get(period) ?? {};
		}
		breakdowns.desktops = desktops.get(period) ?? {};

		return {
			period,
			activeUsers: Number(row.active_users),
			...breakdowns,
		};
	});
}

export async function queryStats(
	granularity: Granularity,
	periods: number,
) {
	const trunc = GRANULARITY_TO_TRUNC[granularity];
	const sinceStr = computeSince(granularity, periods);
	return queryBreakdowns(trunc, "date >= $1::DATE", { 1: sinceStr });
}

const ALLOWED_FILTERS: Record<
	string,
	{ column: string; op: "eq" | "list_contains" | "gte" | "lte" }
> = {
	desktop: { column: "desktops", op: "list_contains" },
	os: { column: "operating_system", op: "eq" },
	arch: { column: "architecture", op: "eq" },
	build: { column: "build_provenance", op: "eq" },
	version: { column: "vicinae_version", op: "eq" },
	display: { column: "display_protocol", op: "eq" },
	chassis: { column: "chassis_type", op: "eq" },
	locale: { column: "locale", op: "eq" },
	since: { column: "date", op: "gte" },
	until: { column: "date", op: "lte" },
};

export { ALLOWED_FILTERS, VALID_GRANULARITIES };
export type { Granularity };

export async function queryAnalytics(
	granularity: Granularity,
	periods: number,
	filters: Record<string, string>,
) {
	const trunc = GRANULARITY_TO_TRUNC[granularity];
	const sinceStr = computeSince(granularity, periods);

	const whereClauses = [`date >= $1::DATE`];
	const params: Record<string, DuckDBValue> = { 1: sinceStr };
	let paramIdx = 2;

	for (const [key, value] of Object.entries(filters)) {
		const filter = ALLOWED_FILTERS[key];
		if (!filter) continue;

		switch (filter.op) {
			case "eq":
				whereClauses.push(`${filter.column} = $${paramIdx}`);
				params[paramIdx] = value;
				break;
			case "list_contains":
				whereClauses.push(`list_contains(${filter.column}, $${paramIdx})`);
				params[paramIdx] = value;
				break;
			case "gte":
				whereClauses.push(`${filter.column} >= $${paramIdx}::DATE`);
				params[paramIdx] = value;
				break;
			case "lte":
				whereClauses.push(`${filter.column} <= $${paramIdx}::DATE`);
				params[paramIdx] = value;
				break;
		}
		paramIdx++;
	}

	return queryBreakdowns(trunc, whereClauses.join(" AND "), params);
}
