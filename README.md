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

The backend welcomes extension contributors and automatically runs a Codex review when a non-draft pull request is opened, marked ready, reopened, or updated. Blocking findings produce `REQUEST_CHANGES`; a clean review produces `APPROVE` and marks the PR `human-reviewable`. An organization member or repository collaborator can retry by mentioning the reviewer account with a comment containing only `@<reviewer> review`.

The intended repository rule requires two approvals: the reviewer's automated extension-policy approval and a final Code Owner approval from a Vicinae maintainer. Enable stale-approval dismissal so every new commit must pass both reviewers again.

### GitHub reviewer account

Create a fine-grained personal access token for the dedicated reviewer account, limited to `vicinaehq/extensions`, with:

- Contents: read
- Pull requests: read and write
- Issues: read and write
- Metadata: read (automatically granted)

Add a repository webhook for Pull request and Issue comment events pointing to `https://store.vicinae.dev/webhooks/github`. Configure the same secret as `GITHUB_WEBHOOK_SECRET`.

Set `GITHUB_PAT`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_REVIEW_REPOSITORY`, and `GITHUB_REVIEW_MAINTAINER`. The backend discovers the reviewer login from the PAT, verifies every webhook delivery, and accepts the strict `@<reviewer> review` command only from an organization member or repository collaborator.

The reviewer maintains one welcome/status comment and the following labels:

- `ai-reviewing`
- `ai-changes-requested`
- `human-reviewable`
- `ai-review-failed`

It mentions `GITHUB_REVIEW_MAINTAINER` once per commit when the automated review transitions to approved.

### AI-assisted issue triage

The same GitHub account can label newly opened issues in `vicinaehq/vicinae` and notify `GITHUB_REVIEW_MAINTAINER` when it finds likely duplicates. Triage fetches all open and closed issues for every run, ranks a small candidate set locally, and sends only those candidates to Codex. It does not cache issues, label an issue as a duplicate, or close issues.

An organization owner/member or repository collaborator can rerun triage on an existing issue by commenting `@<reviewer> triage`, using the authenticated bot account's actual login.

Give the account Issues read and write access to the main repository, add the Issues webhook event, and enable triage:

```env
GITHUB_TRIAGE_REPOSITORY=vicinaehq/vicinae
CODEX_TRIAGE_REASONING_EFFORT=medium
CODEX_TRIAGE_TIMEOUT_MS=300000
```

Triage is enabled when `GITHUB_TRIAGE_REPOSITORY` is configured and disabled when it is absent.

The bot reads the repository's labels on every run, so newly created labels are available without a deployment. The hardcoded protected set prevents it from applying `auto-triaged`, `confirmed`, `duplicate`, `good first issue`, `help wanted`, `not planned`, and `wontfix`. The backend applies `auto-triaged` itself only after successful completion.

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
CODEX_REVIEW_REASONING_EFFORT=high
CODEX_REVIEW_TIMEOUT_MS=900000
```

Each job uses an ephemeral directory containing only the trusted extension-reviewer skill, PR diff, changed extension files, and the pinned `@vicinae/api` TypeScript declarations. Package runtime code is not exposed or executed. The reviewer verifies API recommendations against those declarations and can attach one-click GitHub suggested changes for small exact replacements. The Codex SDK receives a sanitized environment and a least-privilege permission profile: model-generated commands can read only minimal runtime paths and the ephemeral review workspace, with no filesystem writes, approvals, command network access, or web search. The private Codex state directory remains outside that profile. The Docker image includes Bubblewrap for Linux enforcement.
