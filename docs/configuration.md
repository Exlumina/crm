# Configuration

`npm run setup` creates an ignored `.env` and `config/company.json`. Existing files are preserved. The committed examples contain no usable credentials.

| Setting | Meaning |
| --- | --- |
| `CRM_ADMIN_PASSWORD` | Administrator login password; use a long unique random value, at least 16 characters. |
| `CRM_MCP_TOKEN` | Independent bearer credential for MCP clients; at least 32 characters and different from the password. |
| `CRM_HOST` | Listener; default `127.0.0.1`. Bind a network interface only after configuring access controls. |
| `CRM_PORT` | HTTP port; default `3000`. |
| `CRM_DATA_DIR` | This installation's data directory; default `./data`. Use persistent storage for deployed instances. |
| `CRM_PUBLIC_URL` | Exact public origin, such as `https://crm.example`, when using your HTTPS reverse proxy. |
| `CRM_DEV_ORIGIN` | Optional exact Vite development origin; generated local setup uses `http://127.0.0.1:5173`. Remove for deployment. |

The app rejects missing/weak configuration instead of selecting a shared default password. Restart after changing credentials or configuration. Sessions are process-local and are lost on restart; sign in again. The MCP token has the same record-editing access as the administrator.

Company configuration fields: `name`, valid IANA `timezone`, boolean `loadCompanyIcons`, and initial `boards`. Board IDs must be stable and stages unique. Startup initializes boards only for a new database. Change existing boards in the interface; stage deletion/renaming is intentionally restricted to preserve memberships.

No domain, account or remote database is preconfigured. There is no fallback to a maintainer's CRM. Icons, when enabled, are fetched by the browser from the website saved in each company record. Missing icons use initials. Personal records keep initials.

## Remote hosting

Run behind a TLS reverse proxy on infrastructure you control. Forward to the local listener and configure the public origin. Use a persistent database directory, protect its filesystem permissions, back it up and restrict access to intended users. The repository does not create a cloud account, database, DNS entry, tunnel or public deployment. Do not expose Vite development mode as a production service.

This release provides a shared administrator workspace. Add and review a real authorization model before using it for separate tenants or groups with different access rights.
