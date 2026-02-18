# Tempo — TikTok Shop Analytics

Multi-tenant SaaS platform for TikTok Shop agency management.

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **Database/Auth:** Supabase (PostgreSQL + Auth)
- **Charts:** Recharts
- **Validation:** Zod

## Getting Started

```bash
# Install dependencies
npm install

# Copy env file and fill in your keys
cp .env.local.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (admin)/           # Admin portal (route group)
│   │   ├── dashboard/     # Operations center
│   │   ├── brands/        # Brand management
│   │   ├── analytics/     # Analytics deep dive
│   │   ├── creators/      # Creator management
│   │   └── settings/      # Agency settings
│   ├── (brand)/           # Brand portal
│   ├── (creator)/         # Creator portal
│   ├── (manager)/         # Manager portal
│   ├── auth/              # Auth callbacks
│   ├── login/             # Login page
│   ├── signup/            # Signup page
│   └── api/health/        # Health check
├── components/
│   ├── ui/                # shadcn/ui components
│   ├── layout/            # Sidebar, header, mobile nav
│   ├── dashboard/         # Stat cards, charts, tables
│   └── auth/              # Login/signup forms
├── lib/
│   ├── supabase/          # Client, server, middleware utilities
│   ├── auth/roles.ts      # Role-based access control
│   ├── data/              # Data fetching (RPC wrappers, brands, creators)
│   └── utils/             # Formatting, constants
├── hooks/                 # React hooks (useUser, useTenant, useBrandFilter)
├── types/                 # TypeScript types (database, shared)
└── styles/                # Global CSS
```

## Portals

| Portal | URL Prefix | Roles |
|---|---|---|
| Admin | `/dashboard`, `/brands`, etc. | owner, admin |
| Brand | `/brand-dashboard` | owner, admin, brand |
| Creator | `/creator-dashboard` | owner, admin, creator |
| Manager | `/manager-dashboard` | owner, admin, manager |

## Multi-Tenancy

Every data query is scoped by `tenant_id`. Tenants represent agencies. Users belong to exactly one tenant.

## Auth

- Email/password + magic link via Supabase Auth
- Discord OAuth support
- Middleware protects all routes except `/login`, `/signup`, `/auth/*`
