# Contributing

Use Node.js 24 or later. Install with npm ci, run npm test, npm run typecheck, npm run build and npm run check:public before opening a pull request. Tests must use temporary databases and synthetic records. Do not connect tests to a live CRM.

Keep the domain service shared between the browser and MCP. Preserve revision checks, idempotent writes, unknown fields and evidence. Use small focused changes with meaningful tests. Never add a default cloud endpoint, telemetry, a credential, a real contact export or an actual company relationship to examples. Use reserved .example domains.

Describe what changed and how it was tested. Public bug reports should contain sanitized reproduction steps, not real CRM data. Changes to authentication, backups and external network calls require explicit review.
