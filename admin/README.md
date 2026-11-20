# Voting System — Admin Portal

Standalone administration frontend for the Voting System. It is a separate project from the Voter Portal and talks to the **ASP.NET Core Web API** over REST. The API is the only component that touches the Supabase PostgreSQL database; this app never connects to Supabase directly.

## Tech stack

| Concern    | Choice                                                 |
| ---------- | ------------------------------------------------------ |
| Framework  | Next.js 16 (App Router), React 19                      |
| Language   | TypeScript (strict)                                    |
| Styling    | Tailwind CSS v4 (via `@tailwindcss/postcss`)           |
| Components | shadcn/ui (`base-nova` style, Base UI primitives)      |
| Icons      | Lucide React                                           |
| Utilities  | `class-variance-authority`, `clsx`, `tailwind-merge`   |
| Linting    | ESLint 9 flat config (`eslint-config-next`)            |

## Getting started

Requires **Node.js 20.9+** (developed on Node 24).

```bash
npm install
cp .env.example .env.local   # then set NEXT_PUBLIC_API_URL
npm run dev                  # http://localhost:3000
```

## Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start the development server             |
| `npm run build`     | Create a production build                |
| `npm run start`     | Serve the production build               |
| `npm run lint`      | Run ESLint                               |
| `npm run lint:fix`  | Run ESLint and auto-fix                  |
| `npm run typecheck` | Type-check without emitting              |

## Environment variables

| Variable              | Required | Description                                                        |
| --------------------- | -------- | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL` | Yes      | Base URL of the ASP.NET Core Web API, e.g. `https://localhost:7001/api` |

Read variables through [`src/config/env.ts`](src/config/env.ts), not `process.env` directly. `NEXT_PUBLIC_*` values are inlined into the browser bundle at **build time**, so never put secrets in them, and rebuild after you change them.

## Project structure

```
src/
├── app/                 # App Router: routes, layouts, global styles
├── components/
│   ├── ui/              # shadcn/ui primitives (generated: npx shadcn add <name>)
│   ├── shared/          # App-wide reusable components
│   └── providers/       # React context providers
├── services/
│   ├── api/client.ts    # Centralized REST client
│   └── auth/            # Authentication services (future)
├── hooks/               # Reusable React hooks
├── lib/utils.ts         # cn() and generic helpers
├── types/api.types.ts   # Shared API types
└── config/env.ts        # Typed environment access
```

Imports use the `@/*` alias, which maps to `src/*`.

## API client

[`src/services/api/client.ts`](src/services/api/client.ts) wraps `fetch` for every call to the backend:

```ts
import { apiClient, isApiError } from "@/services/api/client";

const items = await apiClient.get<ItemDto[]>("/items", { params: { page: 1 } });
const created = await apiClient.post<ItemDto, CreateItemRequest>("/items", body);
await apiClient.put<ItemDto>(`/items/${id}`, body);
await apiClient.patch<ItemDto>(`/items/${id}`, partial);
await apiClient.delete(`/items/${id}`);

try {
  await apiClient.post("/items", body);
} catch (error) {
  if (isApiError(error) && error.isValidationError) {
    console.log(error.validationErrors); // { Name: ["The Name field is required."] }
  }
}
```

- Prefixes paths with `NEXT_PUBLIC_API_URL`. Absolute URLs are used as-is.
- Serializes plain objects to JSON. `FormData`, `Blob` and similar bodies are sent unchanged, which covers file uploads.
- Parses JSON responses. Empty responses such as `204 No Content` resolve to `undefined`.
- Throws a single `ApiError` type for every failure. Its `kind` is one of `http`, `network`, `timeout`, `aborted`, `parse` or `config`, and the ASP.NET Core `ProblemDetails` payload is parsed into `error.problem`.
- Serializes query arrays as repeated keys (`?id=1&id=2`), the format ASP.NET Core model binding expects.
- Times out after 30 s by default (`timeoutMs` overrides it). Also accepts an `AbortSignal`, standard `RequestInit` options and Next.js `cache` / `next` options.

### Backend notes (ASP.NET Core)

- Enable **CORS** on the API for the portal's origin (`http://localhost:3000` in development).
- If the API uses cookie authentication, pass `credentials: "include"` and allow credentials in the CORS policy.

## Adding shadcn/ui components

```bash
npx shadcn@latest add <component>
```

Components are written to `src/components/ui` and import `cn` from `@/lib/utils`.

