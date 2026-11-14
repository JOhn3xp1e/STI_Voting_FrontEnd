import type { Metadata } from "next";

import { AcceptInvite } from "@/components/auth/accept-invite";

export const metadata: Metadata = {
  title: "Set up your account",
};

export default function AcceptInvitePage() {
  return <AcceptInvite />;
}
