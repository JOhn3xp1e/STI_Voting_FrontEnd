import type { Metadata } from "next";

import { AdminLogin } from "@/components/auth/admin-login";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function LoginPage() {
  return <AdminLogin />;
}
