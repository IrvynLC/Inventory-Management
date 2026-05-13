# Synology Container Manager Deployment

This package is designed to run as a Container Manager project with two containers:

- `ims-app` - Node.js inventory application
- `ims-postgres` - PostgreSQL database with persistent Docker volume

## 1. Prepare Files

Copy `.env.synology.example` to `.env` and change `POSTGRES_PASSWORD` to a strong database password.

Copy `config/users.example.json` to `config/users.production.json` and set real user passwords. Do not use placeholder passwords.

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
http://NAS-IP:3000/
```

If you change `IMS_PORT` in `.env`, use that port instead.

## 3. First Login

Use the usernames and passwords from `config/users.production.json`.

The login page does not display usernames or passwords.

## 4. Data Persistence

PostgreSQL data is stored in the Docker named volume:

```text
ims_postgres_data
```

Do not delete this volume unless you intentionally want to remove the live database.

## 5. Backups

For production, configure Synology Hyper Backup or a scheduled PostgreSQL backup for the database volume.

You can also run the included PowerShell backup script from a Windows machine that can reach the NAS PostgreSQL port, but the compose file does not expose PostgreSQL outside Docker by default. The safer NAS approach is to use Synology backup tooling for the Docker volume or add a dedicated backup container later.

## Notes

- `IMS_PRODUCTION=1` is enabled in the compose file.
- The app refuses weak seeded passwords in production mode unless `IMS_ALLOW_WEAK_SEEDED_PASSWORDS=1` is set in `.env`.
- Set `IMS_SECURE_COOKIES=1` only after serving the app through HTTPS.
