CREATE DATABASE inventory_management;

CREATE USER inventory_app WITH PASSWORD 'D3xI3ss1nLinks';

GRANT ALL PRIVILEGES ON DATABASE inventory_management TO inventory_app;

\connect inventory_management

GRANT ALL ON SCHEMA public TO inventory_app;
