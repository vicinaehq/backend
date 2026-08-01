# Vicinae Backend

Backend for the Vicinae extension store.

Currently hosted by [@aurelleb](https://github.com/aurelleb) on a [hetzner](https://www.hetzner.com/) VPS.

## Architecture

The architecture of this service is very simple on purpose.

- Hono to serve web requests
- Prisma + sqlite to maintain the list of available extensions in database
- Assets and extension code stored on the local filesystem (could be easily moved to an actual object storage service if needed)

## Vicinae integration

The Vicinae extension store command makes requests to this backend service to retrieve extension-related content.

Vicinae does **not** contact the service outside of this command.

## Development

**Install dependencies:**
```sh
bun install
```

**Set up environment variables:**
```sh
cp .env.example .env
# Edit .env and set your API_SECRET and other configuration
```

**Set up database:**
```sh
# Generate Prisma client
bun prisma generate

# Run migrations
bun prisma migrate dev
```

**Run development server:**
```sh
bun run dev
```

## AI-assisted pull request reviews

The backend welcomes extension contributors and automatically runs a Codex review when a non-draft pull request is opened, marked ready, reopened, or updated. Blocking findings produce `REQUEST_CHANGES`; a clean review produces `APPROVE` and marks the PR `human-reviewable`. The pull request author or a collaborator can also comment `/ai-review` to retry.

The intended repository rule requires two approvals: the App's automated extension-policy approval and a final Code Owner approval from a Vicinae maintainer. Enable stale-approval dismissal so every new commit must pass both reviewers again.

### GitHub App

Create and install a GitHub App on `vicinaehq/extensions` with:

- Contents: read
- Pull requests: read and write
- Issues: read and write
- Metadata: read
- Event subscriptions: Pull request and Issue comment
- Webhook URL: `https://store.vicinae.dev/webhooks/github`

Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY_BASE64`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_REVIEW_REPOSITORY`, and `GITHUB_REVIEW_MAINTAINER`. The webhook verifies every delivery through Octokit and accepts the manual command only from the PR author or a collaborator.

Encode the downloaded GitHub App private key before adding it to your environment:

```sh
base64 -w 0 your-app.private-key.pem
```

Base64 is only an encoding; keep the resulting value secret.

The App maintains one welcome/status comment and the following labels:

- `ai-reviewing`
- `ai-changes-requested`
- `human-reviewable`
- `ai-review-failed`

It mentions `GITHUB_REVIEW_MAINTAINER` once per commit when the automated review transitions to approved.

### Codex subscription

Keep a dedicated, persistent Codex home and authenticate it with the Codex for OSS account:

```sh
CODEX_HOME=/app/data/codex bun node_modules/@openai/codex/bin/codex.js login --device-auth
```

In Docker, run that command inside the backend container and persist `/app/data`. Then deploy the database migration and enable the worker:

```sh
bun prisma migrate deploy
```

```env
CODEX_REVIEW_ENABLED=true
CODEX_REVIEW_HOME=/app/data/codex
```

Each job uses an ephemeral directory containing only the trusted guidelines, PR diff, changed extension files, and the pinned `@vicinae/api` TypeScript declarations. Package runtime code is not exposed or executed. The reviewer verifies API recommendations against those declarations, recommends compatible upgrades, and can attach one-click GitHub suggested changes for small exact replacements. The Codex SDK receives a sanitized environment and runs with a read-only sandbox, no approvals, no command network access, and no web search. The Docker image includes Bubblewrap for the Linux sandbox.
