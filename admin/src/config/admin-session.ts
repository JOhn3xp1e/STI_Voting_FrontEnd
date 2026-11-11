import type { AdminProfile } from "@/types/auth.types";

/**
 * Placeholder identity for the dashboard shell (matches the design reference).
 *
 * Replace with the signed-in admin from the auth session once the ASP.NET Core
 * sign-in endpoint is integrated.
 */
export const PLACEHOLDER_ADMIN: AdminProfile = {
  firstName: "Juan",
  fullName: "Juan Admin",
  email: "admin@legazpi.sti.edu.ph",
  role: "super admin",
};

/** Up to two initials, e.g. "Juan Admin" → "JA". */
export function getInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
