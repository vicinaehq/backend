import { prisma } from "../src/db.js";
import { initAnalytics, closeAnalytics, upsertSystemInfo } from "../src/analytics.js";

async function migrate() {
	console.log("Initializing DuckDB...");
	await initAnalytics();

	console.log("Reading telemetry rows from SQLite...");
	const rows = await prisma.telemetrySystemInfo.findMany();
	console.log(`Found ${rows.length} rows to migrate.`);

	if (rows.length === 0) {
		console.log("Nothing to migrate.");
		return;
	}

	let migrated = 0;

	for (const row of rows) {
		const desktops = JSON.parse(row.desktops) as string[];
		const screens = JSON.parse(row.screens);

		await upsertSystemInfo({
			userId: row.userId,
			date: row.date,
			desktops,
			vicinaeVersion: row.vicinaeVersion,
			displayProtocol: row.displayProtocol,
			architecture: row.architecture,
			operatingSystem: row.operatingSystem,
			buildProvenance: row.buildProvenance,
			locale: row.locale,
			screens,
			chassisType: row.chassisType,
			kernelVersion: row.kernelVersion,
			productId: row.productId,
			productVersion: row.productVersion,
			qtVersion: row.qtVersion ?? undefined,
		});

		migrated++;
		if (migrated % 500 === 0) {
			console.log(`Migrated ${migrated}/${rows.length} rows...`);
		}
	}

	console.log(`Migration complete. ${migrated} rows written to DuckDB.`);
}

migrate()
	.catch((err) => {
		console.error("Migration failed:", err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
		await closeAnalytics();
	});
