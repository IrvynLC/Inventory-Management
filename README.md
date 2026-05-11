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

- Current application data: `app_state` table
- Save history snapshots: `app_revisions` table
- Browser `localStorage` is still used as a short-term cache and offline fallback
- If `data/inventory.sqlite` exists and PostgreSQL is empty, the server will seed PostgreSQL from that SQLite database on first startup

## Run it locally

Start the combined frontend/backend server:

```powershell
npm install
$env:PGHOST = "127.0.0.1"
$env:PGPORT = "5432"
$env:PGDATABASE = "inventory_management"
$env:PGUSER = "inventory_app"
$env:PGPASSWORD = "change-me"
npm start
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

## Company server hosting

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
npm start
```

The app will be available on the server's network address at port `3000`, subject to firewall and reverse-proxy settings.

Back up the PostgreSQL database regularly. If the old SQLite file was used for initial migration, keep a copy as a one-time migration backup but do not use it as the live database.
