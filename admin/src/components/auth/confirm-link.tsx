"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useQueryParams } from "@/hooks/use-query-params";
import { AUTH_ROUTES, safeNext } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";
import {
  getAuthErrorMessage,
  isTemporaryAuthError,
  verifyEmailLink,
  type EmailLinkType,
} from "@/services/auth/admin-auth.service";

import { AuthAlert, AuthButtonLink, AuthChecking, AuthScreen, authPrimaryButtonClassName } from "./auth-screen";
import { LinkExpired } from "./link-expired";

const LINK_TYPES: readonly EmailLinkType[] = ["invite", "email", "recovery"];

/**
 * Every email link (invitation, sign-in link, password reset) lands here.
 *
 * The single-use code is only used when the person clicks Continue, never on
 * page load: school email (Microsoft 365) opens links in the background to
 * scan them, which would otherwise use the link up before the person clicks.
 */
export function ConfirmLink() {
  const router = useRouter();
  const params = useQueryParams();
  const [busy, setBusy] = useState(false);
  /** A temporary problem (rate limit, offline): Continue can be tried again. */
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const tokenHash = params?.get("token_hash") ?? null;
  const rawType = params?.get("type") ?? null;
  const type = LINK_TYPES.find((t) => t === rawType) ?? null;
  const recovery = type === "recovery";
  const next =
    safeNext(params?.get("next")) ?? (recovery ? AUTH_ROUTES.resetPassword : type ? AUTH_ROUTES.acceptInvite : AUTH_ROUTES.afterLogin);

  async function onContinue() {
    if (!tokenHash || !type || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyEmailLink(tokenHash, type);
      router.replace(next);
    } catch (cause) {
      setBusy(false);
      // Anything but a temporary problem means the link is spent.
      if (isTemporaryAuthError(cause)) setError(getAuthErrorMessage(cause));
      else setExpired(true);
    }
  }

  if (!params) {
    return (
      <AuthScreen title="SLVP Admin Portal">
        <AuthChecking label="Reading your link…" />
      </AuthScreen>
    );
  }

  if (expired) return <LinkExpired kind={recovery ? "reset" : "invite"} />;

  if (!tokenHash || !type) {
    return (
      <AuthScreen
        title="This link is incomplete"
        description="Part of the link is missing. Open it again from your email, or copy the whole link into your browser."
        footer="Need help? Contact the MIS office."
      >
        <AuthButtonLink href={AUTH_ROUTES.login}>Back to sign in</AuthButtonLink>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title={recovery ? "Reset password" : "Join SLVP as an admin"}
      description={
        recovery
          ? "Continue to choose a new password for your admin account."
          : "You've been invited to the SLVP admin portal. Continue to create your account."
      }
      footer="Need help? Contact the MIS office."
    >
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <Button
        type="button"
        onClick={onContinue}
        disabled={busy}
        className={cn(authPrimaryButtonClassName, busy && "disabled:opacity-100")}
      >
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {recovery ? "Continue to reset your password" : "Continue to set up your account"}
      </Button>
    </AuthScreen>
  );
}
