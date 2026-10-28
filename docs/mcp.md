# MCP usage

Connect your client to your server's `/mcp` endpoint using its separate bearer token. Streamable HTTP is implemented by the official MCP TypeScript server and Node adapter packages. Test the actual client: remote bearer headers are not available in every hosted assistant, and this release does not provide OAuth discovery or authorization flows.

Typical edit sequence:

1. Search by name and inspect the exact matching record ID.
2. Read that record and its current revision.
3. Apply only the intended fields with that revision and a unique operation ID.
4. Read the same record back before reporting a persisted change.

On retry after an uncertain response, reuse the same operation ID and intent. On a revision conflict, read the record again and review the newer data before issuing a new operation. Never turn a fuzzy name match into an identity merge. A pipeline stage, note or follow-up does not authorize sending a message or claiming a sale.

Responses are bounded. Follow returned cursors when searching or exporting. Keep exported records out of public prompts, logs, issue reports and source repositories. The database is authoritative; an MCP tool appearing in a client does not itself prove write access or a successful update.

Tool definitions are the executable source of truth for exact names and required parameters. List them with a supported MCP client or the SDK rather than copying an outdated schema from a document.
