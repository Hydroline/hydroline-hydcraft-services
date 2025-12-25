# @hydroline/backend

> The central service layer for Hydroline HydCraft Services, powering the integration between web interfaces and the Minecraft server ecosystem.

This backend application serves as the data and logic hub for the entire platform. It is responsible for managing user identities, handling complex business logic for in-game companies, and orchestrating data flow between the game server (via plugins/agents) and the web portal.

## Functional Overview

The system is designed around a modular architecture. Key capabilities include a comprehensive **Authentication System** that bridges web accounts with Minecraft player identities (AuthMe/OAuth). The **Transportation Module** manages railway data and snapshots, while the **Company Module** handles organization structures and assets.

It also features deep **Minecraft Integration**, capable of monitoring server status, synchronizing chat in real-time, and managing player permissions via LuckPerms integration. The **Attachments Service** handles file uploads to local filesystem or S3-compatible storage (e.g. Tencent COS), configurable via environment variables.

## Technology Stack

The project is built on **NestJS**, leveraging its robust dependency injection and modularity.

- **Runtime & Language**: Node.js with TypeScript.
- **Database**: **PostgreSQL** accessed via **Prisma ORM** for type-safe database queries and schema management.
- **Caching**: **Redis** is used for high-performance caching and session management.
- **Authentication**: Implements **Better-Auth** and standard JWT flows for secure access control.
- **Utilities**: Includes `ip2region` for geolocation, `mcping-js` for server protocols, and Prometheus client for metrics.

## Development & Scripts

To start the development server with hot-reload enabled:

```bash
pnpm start:dev
```

Ensure that your PostgreSQL and Redis instances are running and configured in the `.env` file before starting.

### Key Scripts

The `package.json` includes several helper commands, particularly for database management:

- **`pnpm start:dev`**: Runs the NestJS application in watch mode.
- **`pnpm build`**: Compiles the project to the `dist` folder.
- **`pnpm format:write`**: Formats all code using Prettier.

#### Prisma / Database Operations

- **`pnpm db:generate`**: Generates the Prisma Client based on `schema.prisma`. Run this after pulling changes or modifying the schema.
- **`pnpm db:migrate`**: Runs `prisma migrate dev`. It applies schema changes to the local database and creates a new migration file.
- **`pnpm db:deploy`**: Runs `prisma migrate deploy`. Applies pending migrations to the database (typically for production).
- **`pnpm db:push`**: Pushes the schema state directly to the database without creating a migration file. Useful for rapid prototyping.
- **`pnpm db:studio`**: Opens Prisma Studio in the browser to view and edit data.

## Design Guidelines

### Naming & Language

- **English Errors**: All thrown exceptions and error messages must be written in **English**.
- **File Naming**: Use **kebab-case** (hyphenated snake-case) for all filenames and directories (e.g., `auth-provider.service.ts`).

### Structure & Documentation

- **Size Limit**: Files exceeding **800 lines** trigger an automatic refactor requirement. Split logic into smaller sub-modules or utilities.
- **Module README**: Every distinct module directory must contain a `README.md` explaining its functionality.
- **File Headers**: All source files must include a header comment block describing the file's purpose and usage context.
