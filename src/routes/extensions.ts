import { Hono } from 'hono';
import type { StorageAdapter } from '../storage/index.js';
import manifestSchema from '../schemas/manifest.js';
import { z } from 'zod';
import * as JSZip from 'jszip';
import { prisma } from '../db.js';
import { computeChecksum } from '../utils/checksum.js';
import { updateTrendingStatus } from '../utils/trending.js';

type AppContext = {
  Variables: {
    storage: StorageAdapter;
  };
};

const app = new Hono<AppContext>();

const API_SECRET = process.env.API_SECRET;
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10);
const DEFAULT_PAGE_SIZE = parseInt(process.env.DEFAULT_PAGE_SIZE || '100', 10);
const downloadIpCache = new Map<string, Set<string>>();

app.post('/extension/upload', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
	console.log(body);

    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      return c.json(
        {
          error: `File too large. Maximum size is ${MAX_UPLOAD_SIZE} bytes (${Math.round(MAX_UPLOAD_SIZE / 1024 / 1024)}MB)`,
        },
        400
      );
    }

    if (!file.name.endsWith('.zip') && file.type !== 'application/zip') {
      return c.json({ error: 'File must be a ZIP archive' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

	zip.forEach((path) => {
		console.log('path', path);
	});

    const manifestFile = zip.file('package.json');

    if (!manifestFile) {
      return c.json({ error: 'Archive must contain package.json at root' }, 400);
    }

    const manifestContent = await manifestFile.async('string');
    let manifest: any;
    try {
      manifest = JSON.parse(manifestContent);
    } catch (error) {
      return c.json({ error: 'Invalid JSON in package.json' }, 400);
    }

    const validationResult = manifestSchema.safeParse(manifest);
    if (!validationResult.success) {
      return c.json(
        {
          error: 'Invalid manifest',
          details: validationResult.error.format(),
        },
        400
      );
    }

    const validatedManifest = validationResult.data;


	console.log(validatedManifest);

    if (!validatedManifest.dependencies?.['@vicinae/api']) {
      return c.json(
        {
          error: 'Missing required dependency: @vicinae/api must be specified in dependencies',
        },
        400
      );
    }

    const apiVersion = validatedManifest.dependencies['@vicinae/api'];
    const authorHandle = validatedManifest.author;
    const extensionName = validatedManifest.name;
    const extensionTitle = validatedManifest.title;
    const extensionKey = `${authorHandle}/${extensionName}`;
    const storageKey = `extensions/${extensionKey}/latest.zip`;

    // Compute checksum of the ZIP archive
    const fileBuffer = Buffer.from(arrayBuffer);
    const checksum = computeChecksum(fileBuffer);

    const storage = c.get('storage');
    await storage.put(storageKey, fileBuffer, {
      contentType: 'application/zip',
      contentLength: file.size,
    });

    const downloadUrl = await storage.getUrl(storageKey);

    await prisma.gitHubUser.upsert({
      where: { id: authorHandle },
      create: { id: authorHandle },
      update: {},
    });

    const user = await prisma.user.upsert({
      where: { githubId: authorHandle },
      create: { githubId: authorHandle },
      update: {},
    });

    const categoryNames = validatedManifest.categories || [];
    const categoryIds = [];
    for (const categoryName of categoryNames) {
      const category = await prisma.extensionCategory.upsert({
        where: { id: categoryName },
        create: { id: categoryName, name: categoryName },
        update: {},
      });
      categoryIds.push({ id: category.id });
    }

    const platformIds = [];
    const platforms = validatedManifest.platforms || ['Linux'];
    for (const platform of platforms) {
      platformIds.push({ id: platform });
    }

    const extension = await prisma.extension.upsert({
      where: {
        authorId_name: {
          authorId: user.id,
          name: extensionName,
        },
      },
      create: {
        name: extensionName,
        title: extensionTitle,
        description: validatedManifest.description,
        apiVersion,
        storageKey,
        checksum,
        authorId: user.id,
		/*
        categories: {
          connect: categoryIds,
        },
        platforms: {
          connect: platformIds,
        },
		*/
      },
      update: {
        title: extensionTitle,
        description: validatedManifest.description,
        apiVersion,
        storageKey,
        checksum,
		/*
        categories: {
          set: categoryIds,
        },
        platforms: {
          set: platformIds,
        },
		*/
      },
    });

    return c.json({
      success: true,
      extension: {
        id: extension.id,
        key: extensionKey,
        name: extensionName,
        title: extensionTitle,
        author: authorHandle,
        checksum: extension.checksum,
        downloadUrl,
        isNew: extension.createdAt.getTime() === extension.updatedAt.getTime(),
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

app.get('/extensions/list', async (c) => {
  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
    const limit = Math.min(
      200,
      Math.max(1, parseInt(c.req.query('limit') || String(DEFAULT_PAGE_SIZE), 10))
    );
    const category = c.req.query('category');
    const skip = (page - 1) * limit;

    const where: any = {
      killListedAt: null,
    };

    if (category) {
      where.categories = {
        some: {
          id: category,
        },
      };
    }

    const total = await prisma.extension.count({ where });

    const extensions = await prisma.extension.findMany({
      where,
      skip,
      take: limit,
      orderBy: {
        downloadCount: 'desc',
      },
      include: {
        author: {
          include: {
            github: true,
          },
        },
        categories: true,
        platforms: true,
      },
    });

    const storage = c.get('storage');

    const items = await Promise.all(
      extensions.map(async (ext) => {
        const downloadUrl = await storage.getUrl(ext.storageKey);

        return {
          id: ext.id,
          name: ext.name,
          title: ext.title,
          description: ext.description,
          author: ext.author?.github?.id || 'unknown',
          downloadCount: ext.downloadCount,
          apiVersion: ext.apiVersion,
          checksum: ext.checksum,
          trending: ext.trending,
          categories: ext.categories.map((c) => c.name),
          platforms: ext.platforms.map((p) => p.id),
          downloadUrl,
          createdAt: ext.createdAt.toISOString(),
          updatedAt: ext.updatedAt.toISOString(),
        };
      })
    );

    return c.json({
      extensions: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error('List extensions error:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

app.post('/extensions/download-callback', async (c) => {
  try {
    const body = await c.req.json();
    const { extensionId } = body;

    if (!extensionId || typeof extensionId !== 'string') {
      return c.json({ error: 'extensionId is required' }, 400);
    }

    const clientIp = c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
                     c.req.header('x-real-ip') ||
                     'unknown';

    let ipSet = downloadIpCache.get(extensionId);
    if (!ipSet) {
      ipSet = new Set();
      downloadIpCache.set(extensionId, ipSet);
    }

    if (ipSet.has(clientIp)) {
      return c.json({
        success: true,
        counted: false,
        message: 'Download already tracked from this IP'
      });
    }

    ipSet.add(clientIp);

    const extension = await prisma.extension.update({
      where: { id: extensionId },
      data: {
        downloadCount: {
          increment: 1,
        },
      },
      select: {
        downloadCount: true,
      },
    });

    return c.json({
      success: true,
      counted: true,
      downloadCount: extension.downloadCount,
    });
  } catch (error) {
    if ((error as any).code === 'P2025') {
      return c.json({ error: 'Extension not found' }, 404);
    }

    console.error('Download callback error:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

app.post('/extensions/update-trending', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    await updateTrendingStatus();
    return c.json({
      success: true,
      message: 'Trending status updated for all extensions',
    });
  } catch (error) {
    console.error('Update trending error:', error);
    return c.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

export default app;
