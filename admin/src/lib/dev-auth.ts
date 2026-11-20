import type { MeResponse } from "@/types/auth.types";

/**
 * Local shortcut: opens the dashboard without signing in.
 *
 * Only works under `next dev` (NODE_ENV is "development") AND with
 * `NEXT_PUBLIC_DEV_SKIP_AUTH=true` in `.env.local`. A production build always
 * has NODE_ENV "production", so this can never switch on in a deployed site.
 *
 * The backend still decides what the API allows: with `Auth:Enforce` false
 * (the local default) the /api/admin endpoints work without a token.
 */
export const DEV_SKIP_AUTH =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEV_SKIP_AUTH === "true";

const now = new Date().toISOString();

/**
 * `NEXT_PUBLIC_DEV_ELECTION_ADMIN=ELC-00007` (comma-separated for several) makes the stand-in
 * an election admin of those elections instead of a super admin, to try the limited view.
 */
const devElectionIds = (process.env.NEXT_PUBLIC_DEV_ELECTION_ADMIN ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

/** Stand-in `/me` answer used while DEV_SKIP_AUTH is on. */
export const DEV_ME: MeResponse = devElectionIds.length
  ? {
      authUserId: "00000000-0000-0000-0000-000000000001",
      email: "dev@localhost",
      status: "active",
      admin: null,
      role: "election_admin",
      electionAdmins: devElectionIds.map((electionId, i) => ({
        id: `EAD-DEV${i + 1}`,
        electionId,
        electionTitle: null,
        fullName: "Local Dev",
        avatarUrl: null,
        isVerified: true,
      })),
    }
  : {
      authUserId: "00000000-0000-0000-0000-000000000000",
      email: "dev@localhost",
      status: "active",
      admin: {
        id: "ADM-DEV",
        email: "dev@localhost",
        fullName: "Local Dev",
        avatarPath: null,
        avatarUrl: null,
        isActive: true,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      },
      role: "super_admin",
      electionAdmins: [],
    };
