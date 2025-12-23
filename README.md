## hydroline-hydcraft-services

> Hydroline HydCraft Services is a **customized service system built specifically for the HydCraft Minecraft server**.

This project is tightly integrated with the broader **Hydroline ecosystem**, and works in coordination with components such as the Beacon Plugin / Provider, OAuth Proxy, HydCraft Client Agent & Patcher, Hydroline Client Management, and several auxiliary services (see Hydroline org repo). Together, they form a unified backend infrastructure for server operation, data collection, and player-facing services.

At its core, the project focuses on **bridging Minecraft runtime data with real-world server management needs**. It provides features including (but not limited to):

- Map & GIS integration (Leaflet-compatible)
- Company / organization management
- Server status fetching and monitoring
- In-game online chat synchronization
- Modpack metadata and distribution support
- Extensible service modules for future expansion

The service is built with a **modern TypeScript-based tech stack**, featuring:

- **Node.js** and **NestJS** for the backend
- **PostgreSQL** as the primary database
- **Vue 3 + Vite** for the frontend
- **Prisma** for schema and database management
- **OAuth** for authentication
- **S3-compatible object storage** for assets and uploads

The project is currently under **active and rapid iteration**, so internal structure and modules may evolve frequently. Through deep integration with other Hydroline services, the system aims to form a **cohesive, full-coverage service ecosystem** for the HydCraft server.

## Layout

This repository is organized as a **pnpm workspace**, following a clear frontend–backend separation.

```
root
├── .agents/          # Client / agent session data
├── backend/          # Backend (NestJS + TypeScript)
├── frontend/         # Frontend (Vue 3 + Vite + TypeScript)
└── package.json      # pnpm workspace configuration
```

Both the backend and frontend are managed from the root workspace.

## Development

To start the project, run the backend and frontend separately from the root directory:

```bash
pnpm backend:start
pnpm frontend:dev
```

Running them in two terminals is recommended (VS Code split terminals work great).

## Tooling

1. Configure the backend environment variables by copying:

   ```
   backend/.env.sample → backend/.env
   ```

2. Prisma-related commands can be found in `backend/package.json`, including:

   - `pnpm db:push`
   - `pnpm db:generate`
   - other database utilities

3. Code formatting for **both backend and frontend** can be applied from the root workspace:

   ```bash
   pnpm format:write
   ```

   This uses Prettier to keep the entire codebase consistent.
