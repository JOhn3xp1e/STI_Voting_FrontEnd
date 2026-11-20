import type { CSSProperties } from "react";

import { electionPageHref } from "@/config/navigation";
import type { Partylist } from "@/types/partylist.types";

/* Party list helpers: routes, colours, motto and form validation. */

export const partyListsHref = (electionId: string) => electionPageHref(electionId, "party-lists");
export const partyListNewHref = (electionId: string) => `${partyListsHref(electionId)}/new`;
export const partyListEditHref = (electionId: string, partylistId: string) => `${partyListsHref(electionId)}/${encodeURIComponent(partylistId)}`;

/* -------------------------------------------------------------------------- */
/*                                   Colour                                   */
/* -------------------------------------------------------------------------- */

/** Quick picks in the editor. Any other hex colour can be typed in. */
export const PARTY_SWATCHES = ["#E11D48", "#F97316", "#FFC200", "#10B981", "#0891B2", "#2563EB", "#7C3AED", "#DB2777"] as const;

/** "#1e40af" or "1E40AF" → "#1E40AF"; `null` when it isn't a 6-digit hex colour. */
export function normalizeHex(input: string): string | null {
  const hex = input.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : null;
}

/** Dark or white text, whichever reads better on `hex`. */
function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#0f172a" : "#ffffff";
}

/** A party's colour as "#RRGGBB": its own, or brand blue when it has none (independents too). */
export function partyHex(party: { color: string | null } | null): string {
  return (party?.color && normalizeHex(party.color)) || "#0F4C9E";
}

/** Class for a party-coloured surface when the party has no colour (brand blue). */
export const partyColorFallbackClassName = "bg-brand-blue text-white";

/** Background + readable text for a party-coloured surface; `undefined` when the party has no (valid) colour. */
export function partyColorStyle(color: string | null): CSSProperties | undefined {
  const hex = color ? normalizeHex(color) : null;
  return hex ? { backgroundColor: hex, color: readableOn(hex) } : undefined;
}

/* -------------------------------------------------------------------------- */
/*                                    Text                                    */
/* -------------------------------------------------------------------------- */

/** The motto without surrounding quotes, so it can be shown inside “ ”. */
export function mottoText(motto: string): string {
  return motto.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "").trim();
}

/** "P" for "Partyngina" (logo placeholder). */
export function partyInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export const sortPartylists = (parties: readonly Partylist[]) => [...parties].sort((a, b) => a.id.localeCompare(b.id));

/* -------------------------------------------------------------------------- */
/*                                    Form                                    */
/* -------------------------------------------------------------------------- */

export const PLATFORM_MAX_LENGTH = 300;

export interface PartylistForm {
  name: string;
  motto: string;
  /** What's typed in the colour box; empty = no colour. */
  color: string;
  platform: string;
}

export function partylistToForm(party: Partylist | null): PartylistForm {
  return {
    name: party?.name ?? "",
    motto: party ? mottoText(party.motto) : "",
    color: party?.color ?? "",
    platform: party?.platform ?? "",
  };
}

export type PartylistErrors = Partial<Record<"name" | "motto" | "color", string>>;

/** Same rules as the backend (name and motto required, colour a 6-digit hex code). */
export function validatePartylist(form: PartylistForm): PartylistErrors {
  const errors: PartylistErrors = {};
  if (form.name.trim().length < 2) errors.name = form.name.trim() ? "Use at least 2 characters." : "Required.";
  if (!form.motto.trim()) errors.motto = "Required.";
  if (form.color.trim() && !normalizeHex(form.color)) errors.color = "Use a hex code like #1E40AF.";
  return errors;
}
