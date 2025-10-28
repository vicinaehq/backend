import { prisma } from '../db.js';

/**
 * Configuration for trending calculation
 */
const TRENDING_CONFIG = {
  // Time window for calculating download velocity (in milliseconds)
  TIME_WINDOW_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  // Minimum downloads needed to be considered for trending
  MIN_DOWNLOADS: 10,
  // Minimum download rate (downloads per day) to be trending
  MIN_DOWNLOADS_PER_DAY: 2,
  // Top N% of extensions by download velocity are marked as trending
  TOP_PERCENTILE: 0.2, // 20%
};

/**
 * Calculate and update trending status for all extensions
 * This should be called periodically (e.g., via cron job or on significant events)
 */
export async function updateTrendingStatus(): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - TRENDING_CONFIG.TIME_WINDOW_MS);

  // Get all non-killlisted extensions
  const extensions = await prisma.extension.findMany({
    where: {
      killListedAt: null,
    },
    select: {
      id: true,
      downloadCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (extensions.length === 0) {
    return;
  }

  // Calculate download velocity for each extension
  const extensionsWithVelocity = extensions.map((ext) => {
    // Use the more recent of createdAt or windowStart as the effective start
    const effectiveStart = ext.createdAt > windowStart ? ext.createdAt : windowStart;
    const ageInDays = Math.max(1, (now.getTime() - effectiveStart.getTime()) / (24 * 60 * 60 * 1000));
    const downloadsPerDay = ext.downloadCount / ageInDays;

    return {
      id: ext.id,
      downloadCount: ext.downloadCount,
      downloadsPerDay,
      meetsMinimum: ext.downloadCount >= TRENDING_CONFIG.MIN_DOWNLOADS &&
                    downloadsPerDay >= TRENDING_CONFIG.MIN_DOWNLOADS_PER_DAY,
    };
  });

  // Filter to only extensions meeting minimum criteria
  const candidates = extensionsWithVelocity.filter((ext) => ext.meetsMinimum);

  // Sort by download velocity
  candidates.sort((a, b) => b.downloadsPerDay - a.downloadsPerDay);

  // Calculate how many should be trending
  const trendingCount = Math.max(1, Math.ceil(candidates.length * TRENDING_CONFIG.TOP_PERCENTILE));
  const trendingIds = new Set(candidates.slice(0, trendingCount).map((ext) => ext.id));

  // Update all extensions in batch
  await prisma.$transaction([
    // Mark trending extensions
    prisma.extension.updateMany({
      where: {
        id: { in: Array.from(trendingIds) },
      },
      data: {
        trending: true,
      },
    }),
    // Unmark non-trending extensions
    prisma.extension.updateMany({
      where: {
        id: { notIn: Array.from(trendingIds) },
      },
      data: {
        trending: false,
      },
    }),
  ]);
}

/**
 * Mark a specific extension as trending (manual override)
 */
export async function markAsTrending(extensionId: string): Promise<void> {
  await prisma.extension.update({
    where: { id: extensionId },
    data: { trending: true },
  });
}

/**
 * Unmark a specific extension as trending (manual override)
 */
export async function unmarkAsTrending(extensionId: string): Promise<void> {
  await prisma.extension.update({
    where: { id: extensionId },
    data: { trending: false },
  });
}
