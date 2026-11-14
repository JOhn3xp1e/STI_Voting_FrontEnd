import type { Metadata } from "next";

import { ConfirmLink } from "@/components/auth/confirm-link";

export const metadata: Metadata = {
  title: "Continue",
};

/** Landing page of every email link (invitation, sign-in link, password reset). */
export default function ConfirmPage() {
  return <ConfirmLink />;
}
