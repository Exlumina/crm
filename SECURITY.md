# Security

Use this application as one trusted company workspace per installation. It is not a multi-tenant service and does not implement per-user roles, SSO, account recovery, abuse-resistant Internet login or compliance certification. Anyone with the administrator password or MCP token can access that installation's CRM. Keep those credentials separate and private.

The default listener is loopback only. For remote use, configure your own HTTPS reverse proxy, CRM_PUBLIC_URL and explicit network access controls. Never place the app directly on the Internet over plain HTTP. Do not trust identity headers from a proxy; authentication belongs to this application. A publicly readable GitHub repository does not make the CRM database public.

Run npm run setup to generate fresh credentials. Environment files, company configuration, databases, backups and logs are ignored. Use encrypted storage and backups appropriate to your environment. Review source before importing private data. Backups contain all records and history, including deleted/previous field values where retained, and must be protected like the database.

Website icons are disabled by default. If enabled, the visitor's browser contacts saved company websites; those sites can observe requests. Do not enable this for sensitive relationship lists without considering that disclosure.

Report vulnerabilities through this repository's private security advisory reporting, when available. Otherwise contact a maintainer privately through their published GitHub profile. Never attach live credentials, contact records, private contracts or complete production logs to public issues.

Version 0.1 is an early release. Rotate credentials and restart to terminate active sessions as documented in the configuration guide. Keep Node and dependencies updated, test restores, and review any code or MCP client before granting write access.
