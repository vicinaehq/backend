import { Hono } from 'hono';
import type { StorageAdapter } from '@/storage/index.js';
import manifestSchema from '@/schemas/manifest.js';
import { z } from 'zod';
import * as JSZip from 'jszip';
import { prisma } from '@/db.js';
import { computeChecksum } from '@/utils/checksum.js';
import { updateTrendingStatus } from '@/utils/trending.js';
import { getGitHubAvatarUrl } from '@/utils/avatar.js';
import { fetchGitHubUser, getDisplayName } from '@/utils/github.js';
import { getExtensionGitHubUrls, buildAssetUrl } from '@/utils/repository.js';
import { parseIcon } from '@/utils/icons.js';
import { getMimeType } from '@/utils/mime.js';
import type { AppContext } from '@/types/app.js';
import { slugify } from '@/utils/slugify.js';

const app = new Hono<AppContext>();

const API_SECRET = process.env.API_SECRET;
const MAX_UPLOAD_SIZE = parseInt(process.env.MAX_UPLOAD_SIZE || '10485760', 10);
const DEFAULT_PAGE_SIZE = parseInt(process.env.DEFAULT_PAGE_SIZE || '100', 10);

/**
 * Helper function to find a user by GitHub handle (case-insensitive)
 */
async function findUserByGitHubHandle(handle: string) {
	const normalizedHandle = handle.toLowerCase();
	return await prisma.user.findFirst({
		where: {
			github: {
				id: normalizedHandle,
			},
		},
		include: {
			github: true,
		},
	});
}

/**
 * Helper function to find an extension by author handle and name
 */
async function findExtensionByAuthorAndName(authorHandle: string, extensionName: string) {
	const user = await findUserByGitHubHandle(authorHandle);
	if (!user) {
		return null;
	}

	return await prisma.extension.findUnique({
		where: {
			authorId_name: {
				authorId: user.id,
				name: extensionName,
			},
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
}

/**
 * Helper function to format extension data for API responses
 */
async function formatExtensionResponse(
	extension: Awaited<ReturnType<typeof findExtensionByAuthorAndName>>,
	storage: StorageAdapter,
	baseUrl: string
) {
	if (!extension) {
		return null;
	}

	const authorHandle = extension.author?.github?.id || 'unknown';
	const authorName = extension.author?.name || authorHandle;
	const { sourceUrl } = getExtensionGitHubUrls(extension.name);

	// Get storage URLs for icons and README
	const iconLightUrl = extension.iconLight ? await storage.getUrl(extension.iconLight) : null;
	const iconDarkUrl = extension.iconDark ? await storage.getUrl(extension.iconDark) : null;
	const readmeUrl = extension.readmeKey ? await storage.getUrl(extension.readmeKey) : null;

	// Get command icon URLs
	const commandsWithIcons = await Promise.all(
		extension.commands.map(async (cmd) => {
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

	const downloadUrl = `${baseUrl}/store/${authorHandle.toLowerCase()}/${extension.name}/download`;

	return {
		id: extension.id,
		name: extension.name,
		title: extension.title,
		description: extension.description,
		author: {
			handle: authorHandle,
			name: authorName,
			avatarUrl: getGitHubAvatarUrl(authorHandle),
			profileUrl: `https://github.com/${authorHandle}`,
		},
		downloadCount: extension.downloadCount,
		apiVersion: extension.apiVersion,
		checksum: extension.checksum,
		trending: extension.trending,
		icons: {
			light: iconLightUrl,
			dark: iconDarkUrl,
		},
		categories: extension.categories,
		platforms: extension.platforms.map((p) => p.id),
		commands: commandsWithIcons,
		sourceUrl,
		readmeUrl,
		downloadUrl,
		createdAt: extension.createdAt.toISOString(),
		updatedAt: extension.updatedAt.toISOString(),
	};
}

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

app.get('/categories', async (c) => {
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
});

app.get('/search', async (c) => {
	try {
		const query = c.req.query('q');
		const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
		const limit = Math.min(
			200,
			Math.max(1, parseInt(c.req.query('limit') || String(DEFAULT_PAGE_SIZE), 10))
		);
		const skip = (page - 1) * limit;

		if (!query || query.trim().length === 0) {
			return c.json({ error: 'Search query is required' }, 400);
		}

		const searchTerm = query.trim().toLowerCase();
		const storage = c.get('storage');
		const baseUrl = c.get('baseUrl');

		// Search extensions by name, title, or description
		const where: any = {
			AND: [
				{ killListedAt: null },
				{
					OR: [
						{ name: { contains: searchTerm } },
						{ title: { contains: searchTerm } },
						{ description: { contains: searchTerm } },
					],
				},
			],
		};

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

		// Format the extensions
		const items = await Promise.all(
			extensions.map((ext) => formatExtensionResponse(ext, storage, baseUrl))
		);

		return c.json({
			extensions: items,
			query: query.trim(),
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
		console.error('Search extensions error:', error);
		return c.json(
			{
				error: 'Internal server error',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			500
		);
	}
});

// Map of extension key (author/name) to Set of IPs that have downloaded it
const downloadIpMap = new Map<string, Set<string>>();

// Get detailed information about a specific extension
app.get('/:author/:name', async (c) => {
	const author = c.req.param('author');
	const name = c.req.param('name');
	const storage = c.var.storage;
	const baseUrl = c.var.baseUrl;

	const extension = await findExtensionByAuthorAndName(author, name);

	if (!extension) {
		return c.json({ error: 'Extension not found' }, 404);
	}

	const formatted = await formatExtensionResponse(extension, storage, baseUrl);
	return c.json(formatted);
});

// Download zip archive and count download
// We use an in-memory IP map to not duplicate downloads for the same IP per extension.
// GitHub usernames are case-insensitive, so we normalize to lowercase for lookups
app.get('/:author/:name/download', async (c) => {
	const author = c.req.param('author').toLowerCase(); // Normalize to lowercase
	const name = c.req.param('name');
	const storage = c.var.storage;
	const clientIp = c.var.clientIp;

	const extension = await findExtensionByAuthorAndName(author, name);

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

app.get('/list', async (c) => {
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

    // Use the helper function to format each extension
    const items = await Promise.all(
      extensions.map((ext) => formatExtensionResponse(ext, storage, baseUrl))
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

app.post('/update-trending', async (c) => {
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
