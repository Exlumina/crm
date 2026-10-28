# Working on CRM

This is a standalone, configurable CRM. Preserve one independent database and credentials per installation; never add a default connection to a maintainer's or another company's service.

Use Node.js 24+, strict TypeScript, React/Vite and the shared validated domain service. Both browser and MCP mutations must retain current-revision checks, retry-safe operation IDs and audit history. Keep authentication, request-origin validation and backup ownership checks intact.

Tests use only synthetic records and temporary databases. Use reserved .example domains. Do not commit local company configuration, credentials, customer records, backups, runtime logs or generated build output. Third-party integrations and network lookups must be opt-in and documented.

Before submitting a change run npm test, npm run typecheck, npm run build and npm run check:public. Add meaningful tests for changed behavior; report validation limits accurately. Preserve MIT attribution and third-party notices. Read SECURITY.md before changing authentication, hosting, exports or recovery.
