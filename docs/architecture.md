# Architecture and extension points

The public edition is a standalone Node.js/SQLite application with a React/Vite browser client. It intentionally has no hosted-product identity, external database binding, company-policy coupling, message queue or private connector.

- `web/`: interface, record forms, board/table views and browser-only display preferences.
- `server/`: authenticated HTTP/MCP entry points, shared validated CRM service and SQLite adapter.
- `config/company.example.json`: safe example branding, timezone and initial pipeline definitions.
- `scripts/`: independent setup, optional synthetic demo, recovery and public-source checks.
- `tests/`: temporary synthetic service and transport tests.

The browser and MCP call the same domain operations. Updates include the revision returned by the preceding read. An operation ID identifies one intent and is reused only when retrying identical content. SQLite commits data, operation receipts and audit entries together. Retry handling must not bypass a revision conflict or overwrite a manual correction.

A deployment is one trusted workspace. Two deployments use different data directories and credentials. No background job synchronizes them. Frontend preferences belong to the current browser and contain display settings rather than records.

## Safe customization

Start with company configuration and CSS. Extend the shared service and validation before adding a new field or operation to either transport. Add tests for browser and MCP behavior, conflicts, retry safety, and export/recovery. Preserve unknown historical fields instead of silently deleting them.

The first release prioritizes portability over hosted-platform integration. There are no outbound-email, personal-message ingestion, automatic enrichment or paid-service dependencies. Add integrations explicitly, with narrowly scoped authentication, verified identity mapping and clear evidence handling.
