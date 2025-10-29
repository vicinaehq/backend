import { Hono } from 'hono';
import type { StorageAdapter } from '../storage/index.js';
import manifestSchema from '../schemas/manifest.js';
import { z } from 'zod';
import * as JSZip from 'jszip';
import { prisma } from '../db.js';
import { computeChecksum } from '../utils/checksum.js';
import { updateTrendingStatus } from '../utils/trending.js';
import { getGitHubAvatarUrl } from '../utils/avatar.js';
import { fetchGitHubUser, getDisplayName } from '../utils/github.js';
import { getExtensionGitHubUrls, buildAssetUrl } from '../utils/repository.js';
import { parseIcon } from '../utils/icons.js';
import { getMimeType } from '../utils/mime.js';
import type { AppContext } from '../types/app.js';
import { slugify } from '../utils/slugify.js';

const app = new Hono<AppContext>();

const API_SECRET = process.env.API_SECRET;
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10);
const DEFAULT_PAGE_SIZE = parseInt(process.env.DEFAULT_PAGE_SIZE || '100', 10);

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
    // Normalize author handle to lowercase for consistent storage paths
    const extensionKey = `${authorHandle.toLowerCase()}/${extensionName}`;
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

    // Fetch GitHub user info to populate name
    const githubUserInfo = await fetchGitHubUser(authorHandle);
    const displayName = getDisplayName(githubUserInfo, authorHandle);

    // Normalize GitHub handle to lowercase for case-insensitive lookups
    const normalizedHandle = authorHandle.toLowerCase();

    await prisma.gitHubUser.upsert({
      where: { id: normalizedHandle },
      create: { id: normalizedHandle },
      update: {},
    });

    const user = await prisma.user.upsert({
      where: { githubId: normalizedHandle },
      create: {
        githubId: normalizedHandle,
        name: displayName,
      },
      update: {
        name: displayName, // Update name on each upload in case it changed
      },
    });

    const categoryNames = validatedManifest.categories || [];
    const categoryIds = [];
    for (const categoryName of categoryNames) {
      const category = await prisma.extensionCategory.upsert({
        where: { id: slugify(categoryName) },
        create: { id: slugify(categoryName), name: categoryName },
        update: {},
      });
      categoryIds.push({ id: category.id });
    }

    const platformIds = [];
    const platforms = validatedManifest.platforms || ['linux'];
    for (const platform of platforms) {
      platformIds.push({ id: platform });
    }

    // Parse extension icon to determine light/dark variations
    const extensionIcon = parseIcon(validatedManifest.icon);

    // Extract and store icon files from ZIP
    let iconLightKey: string | null = null;
    let iconDarkKey: string | null = null;

    if (extensionIcon.light) {
      const iconPath = extensionIcon.light.startsWith('assets/')
        ? extensionIcon.light
        : `assets/${extensionIcon.light}`;
      const iconFile = zip.file(iconPath);
      if (iconFile) {
        const iconBuffer = await iconFile.async('nodebuffer');
        iconLightKey = `extensions/${extensionKey}/${extensionIcon.light}`;
        await storage.put(iconLightKey, iconBuffer, {
          contentType: getMimeType(extensionIcon.light),
        });
      }
    }

    if (extensionIcon.dark) {
      const iconPath = extensionIcon.dark.startsWith('assets/')
        ? extensionIcon.dark
        : `assets/${extensionIcon.dark}`;
      const iconFile = zip.file(iconPath);
      if (iconFile) {
        const iconBuffer = await iconFile.async('nodebuffer');
        iconDarkKey = `extensions/${extensionKey}/${extensionIcon.dark}`;
        await storage.put(iconDarkKey, iconBuffer, {
          contentType: getMimeType(extensionIcon.dark),
        });
      }
    }

    // Extract and store README
    let readmeKey: string | null = null;
    const readmeFile = zip.file('README.md');
    if (readmeFile) {
      const readmeBuffer = await readmeFile.async('nodebuffer');
      readmeKey = `extensions/${extensionKey}/README.md`;
      await storage.put(readmeKey, readmeBuffer, {
        contentType: 'text/markdown',
      });
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
        iconLight: iconLightKey,
        iconDark: iconDarkKey,
        readmeKey,
        authorId: user.id,
        categories: {
          connect: categoryIds,
        },
        platforms: {
          connect: platformIds,
        },
      },
      update: {
        title: extensionTitle,
        description: validatedManifest.description,
        apiVersion,
        storageKey,
        checksum,
        iconLight: iconLightKey,
        iconDark: iconDarkKey,
        readmeKey,
        categories: {
          set: categoryIds,
        },
        platforms: {
          set: platformIds,
        }
      },
    });

    // Delete existing commands and recreate them (simpler than updating)
    await prisma.command.deleteMany({
      where: { extensionId: extension.id },
    });

    // Create commands from manifest
    const commands = validatedManifest.commands || [];
    for (const cmd of commands) {
      // Parse command icon to determine light/dark variations
      const commandIcon = parseIcon(cmd.icon);

      // Extract and store command icons
      let cmdIconLightKey: string | null = null;
      let cmdIconDarkKey: string | null = null;

      if (commandIcon.light) {
        const iconPath = commandIcon.light.startsWith('assets/')
          ? commandIcon.light
          : `assets/${commandIcon.light}`;
        const iconFile = zip.file(iconPath);
        if (iconFile) {
          const iconBuffer = await iconFile.async('nodebuffer');
          cmdIconLightKey = `extensions/${extensionKey}/${commandIcon.light}`;
          await storage.put(cmdIconLightKey, iconBuffer, {
            contentType: getMimeType(commandIcon.light),
          });
        }
      }

      if (commandIcon.dark) {
        const iconPath = commandIcon.dark.startsWith('assets/')
          ? commandIcon.dark
          : `assets/${commandIcon.dark}`;
        const iconFile = zip.file(iconPath);
        if (iconFile) {
          const iconBuffer = await iconFile.async('nodebuffer');
          cmdIconDarkKey = `extensions/${extensionKey}/${commandIcon.dark}`;
          await storage.put(cmdIconDarkKey, iconBuffer, {
            contentType: getMimeType(commandIcon.dark),
          });
        }
      }

      await prisma.command.create({
        data: {
          extensionId: extension.id,
          name: cmd.name,
          title: cmd.title,
          subtitle: cmd.subtitle || null,
          description: cmd.description || null,
          keywords: cmd.keywords || [],
          mode: cmd.mode,
          disabledByDefault: cmd.disabledByDefault || false,
          beta: cmd.beta || false,
          iconLight: cmdIconLightKey,
          iconDark: cmdIconDarkKey,
        },
      });
    }

    return c.json({
      success: true,
      extension: {
        id: extension.id,
        key: extensionKey,
        name: extensionName,
        title: extensionTitle,
        author: {
          handle: authorHandle,
          name: displayName,
          avatarUrl: getGitHubAvatarUrl(authorHandle),
          profileUrl: `https://github.com/${authorHandle}`,
        },
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

app.get('/extensions/categories', async (c) => {
	const categories = await prisma.extensionCategory.findMany({
		select: {
			id: true,
			name: true,
			_count: { select: { extensions: true } },
		}
	});

	return c.json(categories.map(({id, name, _count}) => ({
		id,
		name,
		extensions: _count.extensions
	})));
})

// Map of extension key (author/name) to Set of IPs that have downloaded it
const downloadIpMap = new Map<string, Set<string>>();

// Download zip archive and count download
// We use an in-memory IP map to not duplicate downloads for the same IP per extension.
// GitHub usernames are case-insensitive, so we normalize to lowercase for lookups
app.get('/extensions/:author/:name/download', async (c) => {
	const author = c.req.param('author').toLowerCase(); // Normalize to lowercase
	const name = c.req.param('name');
	const storage = c.var.storage;
	const clientIp = c.var.clientIp;

	// Find user by GitHub handle
	// Note: GitHub handles are case-insensitive, and we normalize to lowercase
	const user = await prisma.user.findFirst({
		where: {
			github: {
				id: author,
			},
		},
	});

	if (!user) {
		return c.json({ error: 'Author not found' }, 404);
	}

	const extension = await prisma.extension.findUnique({
		where: {
			authorId_name: {
				authorId: user.id,
				name,
			},
		},
		include: { author: true },
	});

	if (!extension) {
		return c.json({ error: 'Extension not found' }, 404);
	}

	const file = await storage.get(extension.storageKey);

	// Use normalized author/name as the key for IP deduplication
	const extensionKey = `${author}/${name}`;

	// Check if this IP has already downloaded this extension
	if (!downloadIpMap.has(extensionKey)) {
		downloadIpMap.set(extensionKey, new Set<string>());
	}

	const ipSet = downloadIpMap.get(extensionKey)!;
	const isNewDownload = !ipSet.has(clientIp);

	if (isNewDownload) {
		ipSet.add(clientIp);
		await prisma.extension.update({
			where: { id: extension.id },
			data: { downloadCount: { increment: 1 } },
		});
	}

	return new Response(file, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${name}-latest.zip"`,
		},
	});
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
        commands: true,
      },
    });

    const storage = c.get('storage');
    const baseUrl = c.get('baseUrl');

    const items = await Promise.all(
      extensions.map(async (ext) => {
        const authorHandle = ext.author?.github?.id || 'unknown';
        const authorName = ext.author?.name || authorHandle;

        // Use the download endpoint instead of direct storage URL for tracking
        // Normalize author handle to lowercase for consistent URLs
        const downloadUrl = `${baseUrl}/extensions/${authorHandle.toLowerCase()}/${ext.name}/download`;
        const { sourceUrl } = getExtensionGitHubUrls(ext.name);

        // Get storage URLs for icons and README
        const iconLightUrl = ext.iconLight ? await storage.getUrl(ext.iconLight) : null;
        const iconDarkUrl = ext.iconDark ? await storage.getUrl(ext.iconDark) : null;
        const readmeUrl = ext.readmeKey ? await storage.getUrl(ext.readmeKey) : null;

        // Get command icon URLs
        const commandsWithIcons = await Promise.all(
          ext.commands.map(async (cmd) => {
            const cmdIconLight = cmd.iconLight ? await storage.getUrl(cmd.iconLight) : null;
            const cmdIconDark = cmd.iconDark ? await storage.getUrl(cmd.iconDark) : null;

            return {
              id: cmd.id,
              name: cmd.name,
              title: cmd.title,
              subtitle: cmd.subtitle,
              description: cmd.description,
              keywords: cmd.keywords as string[],
              mode: cmd.mode,
              disabledByDefault: cmd.disabledByDefault,
              beta: cmd.beta,
              icons: {
                light: cmdIconLight,
                dark: cmdIconDark,
              },
            };
          })
        );

        return {
          id: ext.id,
          name: ext.name,
          title: ext.title,
          description: ext.description,
          author: {
            handle: authorHandle,
            name: authorName,
            avatarUrl: getGitHubAvatarUrl(authorHandle),
            profileUrl: `https://github.com/${authorHandle}`,
          },
          downloadCount: ext.downloadCount,
          apiVersion: ext.apiVersion,
          checksum: ext.checksum,
          trending: ext.trending,
          icons: {
            light: iconLightUrl,
            dark: iconDarkUrl,
          },
          categories: ext.categories,
          platforms: ext.platforms.map((p) => p.id),
          commands: commandsWithIcons,
          sourceUrl,
          readmeUrl,
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
