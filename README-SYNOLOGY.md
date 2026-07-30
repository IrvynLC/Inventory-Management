# Synology Container Manager Deployment

This package is designed to run as a Container Manager project with three containers:

- `app` - Node.js inventory application
- `postgres` - PostgreSQL database with persistent Docker volume
- `postgres-backup` - monthly PostgreSQL backup runner

## 1. Prepare Files

Copy `.env.synology.example` to `.env` and change `POSTGRES_PASSWORD` to a strong database password.

Copy `config/users.example.json` to `config/users.production.json` and set real user passwords. Do not use placeholder passwords.

For a clean database, do not copy any old `data/inventory.sqlite` file into the Synology project folder. The Synology compose file also disables SQLite auto-migration so the first startup creates empty inventory tables and only seeds the users from `config/users.production.json`.

## 2. Upload To Synology

Upload the project folder or the generated zip file to a shared folder on the NAS.

In Synology Container Manager:

1. Open **Project**.
2. Create a new project.
3. Select the uploaded project folder.
4. Use `docker-compose.synology.yml` as the compose file.
5. Start the project.

The app will be available on:

```text
http://NAS-IP:3080/
```

If you change `IMS_PORT` in `.env`, use that port instead.

## 3. Clean Database Startup

On first startup, PostgreSQL creates a Docker volume for the project. Synology/Docker usually names it with the project name as a prefix, for example:

```text
inventory-management-v3_ims_postgres_data
```

The inventory database starts empty. Only users from `config/users.production.json` are created.

If you already started the project before and want to wipe all inventory data, stop the project in Container Manager, delete that project's `ims_postgres_data` volume, then start the project again. This permanently deletes the database, so only do it when you intentionally want a clean install.

If you use SSH on the Synology, the equivalent reset command is:

```sh
docker volume ls
docker volume rm PROJECT-NAME_ims_postgres_data
```

Run that only after the project is stopped.

If a first startup fails while creating PostgreSQL, delete the failed project and its `ims_postgres_data` volume before trying again. A failed PostgreSQL initialization can leave a partial database folder behind.

## 4. First Login

Use the usernames and passwords from `config/users.production.json`.

The login page does not display usernames or passwords.

## 5. Data Persistence

PostgreSQL data is stored in the Docker volume:

```text
PROJECT-NAME_ims_postgres_data
```

Do not delete this volume unless you intentionally want to remove the live database.

## 6. Backups

The compose project includes an automatic monthly PostgreSQL backup container.
The backup container uses a newer PostgreSQL client image so it can restore dump files created by newer `pg_dump` versions while the live database remains on the stable PostgreSQL server image.

Backups are written inside the project folder:

```text
backups/postgres
```

By default, the backup runs once per calendar month on day 1. The backup container checks twice a day, so if the NAS is off at midnight it will still run later that day.

You can change the schedule in `.env`:

```env
BACKUP_DAY_OF_MONTH=1
BACKUP_RETENTION_DAYS=395
```

Backup files use PostgreSQL custom format:

```text
inventory-inventory_management-YYYYMMDD-HHMMSS.dump
```

Each backup also creates a matching `.json` manifest. `BACKUP_RETENTION_DAYS=395` keeps roughly 13 monthly backups.

For extra protection, include the `backups/postgres` folder in Synology Hyper Backup or another NAS backup plan.

You can also run the included PowerShell backup script from a Windows machine that can reach the NAS PostgreSQL port, but the compose file does not expose PostgreSQL outside Docker by default.

## Notes

- `IMS_PRODUCTION=1` is enabled in the compose file.
- The app refuses weak seeded passwords in production mode unless `IMS_ALLOW_WEAK_SEEDED_PASSWORDS=1` is set in `.env`.
- Set `IMS_SECURE_COOKIES=1` only after serving the app through HTTPS.
