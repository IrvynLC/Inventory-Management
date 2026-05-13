# Inventory Management System

A lightweight inventory tracking app for company use.

## What it does

- Maintains an inventory register with item name, SKU, quantity, unit, and location
- Supports stock-in transactions for existing items
- Supports stock-out transactions with printable internal handover forms
- Shows inventory overview metrics, searchable register views, and recent stock movement history

## Pages

- `inventory.html` - inventory register and stock adjustments

## Data storage

The application syncs inventory data to PostgreSQL.

- Current application data: relational PostgreSQL tables such as `inventory_items`, `stock_adjustments`, `stock_outs`, `stock_out_items`, `stock_relocations`, `activity_corrections`, and `activity_correction_items`
- Save history snapshots: `app_revisions` table
- Legacy JSON migration source: `app_state` table
- Browser `localStorage` is only used for harmless UI preferences such as filters and sidebar state
- If relational tables are empty, the server seeds them from `app_state`; if `app_state` is empty and `data/inventory.sqlite` exists, the server can seed from that SQLite database on first startup

## Run it locally

Start the combined frontend/backend server:

```powershell
npm install
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5432"
$env:PGDATABASE = "inventory_management"
$env:PGUSER = "inventory_app"
$env:PGPASSWORD = "change-me"
$env:IMS_DEFAULT_USER_PASSWORD = "change-this-local-password"
npm start
```

Validate relational database integrity:

```powershell
npm run db:validate
```

Then open:

```text
http://127.0.0.1:3000/
```

Health check:

```text
http://127.0.0.1:3000/api/health
```

Current data API:

```text
http://127.0.0.1:3000/api/data
```

`/api/data` is read-only during normal operation. Stock changes must go through backend action endpoints so the server can enforce permissions and update inventory transactionally:

- `/api/actions/create-stock` - Admin or Administrative
- `/api/actions/add-stock` - Admin or Administrative
- `/api/actions/draw-stock` - Engineer or Administrative
- `/api/actions/relocate-stock` - Admin
- `/api/actions/correct-activity` - role depends on correction type

Emergency full-state writes are disabled by default. Only enable them temporarily for controlled recovery work by setting `IMS_ALLOW_FULL_DATA_WRITE=1`; even then, the request must be made by an Admin user.

## Company server hosting

For Synology Container Manager deployment, use `README-SYNOLOGY.md` and create a deployable zip with:

```powershell
.\scripts\package-synology.ps1
```

Install Node.js 20 or newer and PostgreSQL on the server. Create the database and user:

```sql
CREATE DATABASE inventory_management;
CREATE USER inventory_app WITH PASSWORD 'replace-with-a-strong-password';
GRANT ALL PRIVILEGES ON DATABASE inventory_management TO inventory_app;
```

For PostgreSQL 15 or newer, also grant schema privileges after connecting to the database:

```sql
\c inventory_management
GRANT ALL ON SCHEMA public TO inventory_app;
```

The same commands are available in `scripts/setup-postgres.sql`.

Copy this project folder to the server, install dependencies, and run:

```powershell
npm install --omit=dev
$env:IMS_HOST = "0.0.0.0"
$env:IMS_PORT = "3000"
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5432"
$env:PGDATABASE = "inventory_management"
$env:PGUSER = "inventory_app"
$env:PGPASSWORD = "replace-with-a-strong-password"
$env:IMS_PRODUCTION = "1"
$env:IMS_SECURE_COOKIES = "1"
$env:IMS_SEED_USERS_JSON = Get-Content .\config\users.production.json -Raw
npm start
```

The app will be available on the server's network address at port `3000`, subject to firewall and reverse-proxy settings.

Back up the PostgreSQL database regularly. If the old SQLite file was used for initial migration, keep a copy as a one-time migration backup but do not use it as the live database.

## User credentials

Seeded user passwords are configured on the server, not in the frontend. For local testing, `IMS_DEFAULT_USER_PASSWORD` sets one shared password for the built-in users.

For production, create a server-only `config/users.production.json` based on `config/users.example.json`, then load it through `IMS_SEED_USERS_JSON`. Do not commit the production file. If you need to rotate seeded user passwords later, set `IMS_RESET_SEEDED_USER_PASSWORDS=1` for one restart, then remove it again.

When `IMS_PRODUCTION=1`, the backend refuses to start with placeholder PostgreSQL credentials. It also refuses weak seeded user passwords unless `IMS_ALLOW_WEAK_SEEDED_PASSWORDS=1` is set.

## PostgreSQL backups

Create a manual backup:

```powershell
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5432"
$env:PGDATABASE = "inventory_management"
$env:PGUSER = "inventory_app"
$env:PGPASSWORD = "replace-with-a-strong-password"
.\scripts\backup-postgres.ps1
```

Backups are written to `backups/postgres` as compressed PostgreSQL custom-format `.dump` files with a small JSON manifest. The default retention is 30 days.

Restore a backup:

```powershell
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5432"
$env:PGDATABASE = "inventory_management"
$env:PGUSER = "inventory_app"
$env:PGPASSWORD = "replace-with-a-strong-password"
.\scripts\restore-postgres.ps1 -BackupFile .\backups\postgres\inventory-inventory_management-YYYYMMDD-HHMMSS.dump
```

To restore over an existing database, add `-Clean`. Use this only after confirming the backup file and target database:

```powershell
.\scripts\restore-postgres.ps1 -BackupFile .\backups\postgres\inventory-inventory_management-YYYYMMDD-HHMMSS.dump -Clean
```

Register a daily Windows Task Scheduler backup:

```powershell
$env:PGDATABASE = "inventory_management"
$env:PGUSER = "inventory_app"
.\scripts\register-backup-task.ps1 -At "23:00" -RetentionDays 30
```

For scheduled backups, configure PostgreSQL authentication for the Windows account running the task. Prefer `%APPDATA%\postgresql\pgpass.conf` so the password is not stored in the scheduled task command. The line format is:

```text
127.0.0.1:5432:inventory_management:inventory_app:replace-with-a-strong-password
```

Test restore on a non-production database before relying on the backup plan for go-live.
