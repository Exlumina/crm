# CRM

A focused, self-hosted CRM with a browser workspace and authenticated MCP tools. Adapt it to your company: people, companies, pipelines, notes, ratings, follow-ups, saved views, and separate board/table preferences.

This is a standalone public edition, selectively adapted from an internal application. It has its own Node.js server, SQLite database and authentication. It contains no real customer records, private service endpoints or connection to another company's CRM. Installations start empty; demo data is optional and fictional.

## Quick start

Requires **Node.js 24+**, npm and a current browser.

```sh
git clone https://github.com/Exlumina/crm.git
cd crm
npm ci
npm run setup
npm run build
npm start
```

Open **http://127.0.0.1:3000**. Open the generated `.env` locally and use `CRM_ADMIN_PASSWORD` to sign in. Setup generates fresh random credentials without printing them and leaves existing configuration unchanged. Keep `.env` private. Stop the server with Ctrl-C.

Optional fictional demo, before starting the server:

```sh
npm run seed:demo
```

The demo never imports external data. Review its command output; it is a separate opt-in action.

## Make it yours

Edit `config/company.json` created by setup. Set the display name, IANA timezone, initial boards and stages. A new database initializes from these boards; later board changes happen in the CRM's Configure board controls. Existing data is never reset by editing this file. Website icons are optional and off by default.

```json
{
  "name": "Example Company CRM",
  "timezone": "UTC",
  "loadCompanyIcons": false,
  "boards": [
    {"id": "sales", "name": "Sales", "stages": ["To review", "Contacted", "Won", "Closed"]}
  ]
}
```

Your database is in `data/` by default. Each installation uses only its own database and credentials. See [configuration](docs/configuration.md) and [security](SECURITY.md) before remote hosting.

## What is included

- People and companies, searchable records, tags and ratings.
- Independent pipeline memberships and stages, table and board views, keyboard/touch stage selectors and desktop dragging.
- Notes, reply obligations, explicit due dates, next actions and change history.
- Saved views and per-board browser display preferences.
- Shared browser/MCP validation, current-revision checks and retry-safe operation IDs.
- Record export and full database backup/restore commands.
- Optional website icons with initials fallback. No enrichment or external network lookup is enabled by default.

This is one trusted workspace per installation. It is not a multi-tenant SaaS: no per-user permissions, billing, email sending, inbox synchronization or built-in OAuth/SSO. Using an MCP client does not grant permission to contact anyone. Read [SECURITY.md](SECURITY.md).

## Connect an MCP client

The server exposes Streamable HTTP at **`/mcp`** on your own installation. Configure a client that supports a remote MCP URL and bearer authentication:

- URL for local use: `http://127.0.0.1:3000/mcp`
- Authorization header: `Bearer <your CRM_MCP_TOKEN from .env>`

Use a secret field or the client's supported environment-variable mechanism. Do not paste the token into source files, URLs, prompts or issue reports. Each client has its own configuration format; follow that client's documentation. The browser administrator password and MCP bearer token are separate.

The MCP can search/read records, create/update records, manage boards/stages, append notes, set follow-ups, inspect history and export bounded pages. Write tools require the current revision and a stable operation identifier. See [MCP usage](docs/mcp.md). No hosted service or proprietary plugin is required. Authentication compatibility with a particular cloud client must be checked separately; clients that require OAuth need their own supported gateway.

## Development

```sh
npm ci
npm run setup
# Terminal 1:
npm run dev:server
# Terminal 2:
npm run dev
```

Open the Vite URL at `http://127.0.0.1:5173`. The generated local-development origin permits that exact origin. Remove `CRM_DEV_ORIGIN` when hosting remotely. Vite proxies API requests to the local backend.

```sh
npm test
npm run typecheck
npm run build
npm run check:public
```

Tests use temporary synthetic databases. Never point them at your production data. [Architecture](docs/architecture.md) explains the shared service and extension points.

## Backup and restore

Keep protected backups outside the source checkout. Read [recovery instructions](docs/recovery.md) for the exact CLI and offline restore procedure. A Git clone contains application code, not CRM data. A code rollback does not undo database writes.

## License

[MIT](LICENSE), copyright Exlumina contributors. Dependencies retain their [own licenses](THIRD_PARTY_NOTICES.md). The public edition and an internal deployment are independently operated. Forks may customize the software under the license; do not imply endorsement or publish another company's branding, data or credentials.
