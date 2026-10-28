# Backup and restore

Backups contain private CRM records, revision receipts and history. Keep them in protected storage outside the repository. Test a restore before relying on a backup.

## Record export

The browser's Data & recovery page can download a bounded, paginated record export. This is for portability and inspection; it is not a full database recovery image.

## Full backup

The browser can download a full JSON recovery snapshot. It briefly pauses writes with a token owned by that backup operation, captures the database tables, then releases the pause. A failed or interrupted capture must not be treated as complete.

For an offline SQLite backup, stop the server and run:

```sh
npm run backup -- /absolute/path/to/CRM_Backup.sqlite
```

The command refuses to run while another process holds that installation's data lock and refuses to overwrite an existing destination. Store the resulting file privately.

## Restore into a new data directory

Stop the server. Keep the current database unchanged and choose a fresh directory:

```sh
CRM_DATA_DIR=./restored-data npm run restore -- /absolute/path/to/CRM_Backup.sqlite
```

A full browser JSON snapshot is also accepted by the restore command. A plain record export is not a full recovery snapshot. The tool validates the format, restores records and history together, and clears an old backup write pause. Restore inputs are limited to 100 MB in this first release; use only trusted backups from your own installation. It refuses an existing destination database.

After a successful restore, set `CRM_DATA_DIR=./restored-data` in your private `.env`, start the server, sign in and check representative records, stages, notes and history. Back up your private company configuration and credentials separately. The database backup includes pipeline configuration, but not config/company.json branding or the administrator password and MCP bearer token from .env. Use your own configuration and credentials after restoration.

A crash can leave `process.lock` in the data directory. Confirm that the old server and all backup/restore processes are stopped before removing that one stale lock file. Do not remove it merely because a second server refuses to start. Never run two writers against the same database directory.

A Git checkout or code rollback changes application code only. It does not recover records or reverse saved business changes.
