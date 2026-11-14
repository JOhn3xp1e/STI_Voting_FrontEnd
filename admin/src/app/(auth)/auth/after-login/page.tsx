import type { Metadata } from "next";

import { AfterLogin } from "@/components/auth/after-login";

export const metadata: Metadata = {
  title: "Signing in",
};

/** Routes a fresh sign-in (Google) by the backend's `/me` answer. */
export default function AfterLoginPage() {
  return <AfterLogin />;
}
