import { AUTH_ROUTES } from "@/lib/auth-routing";

import { AuthButtonLink, AuthScreen } from "./auth-screen";

/** Card for a used or expired email link: invitations go back to sign in, reset links to a new request. */
export function LinkExpired({ kind }: { kind: "invite" | "reset" }) {
  if (kind === "reset") {
    return (
      <AuthScreen
        title="This reset link has expired"
        description="Each reset link works only once and expires after a while. Request a new one to choose your password."
        footer="Need help? Contact the MIS office."
      >
        <AuthButtonLink href={AUTH_ROUTES.forgotPassword}>Request a new link</AuthButtonLink>
      </AuthScreen>
    );
  }
  return (
    <AuthScreen
      title="This invite has expired"
      description="Each invite link works only once and expires after a while. Ask the person who invited you to send a new one."
      footer="Need help? Contact the MIS office."
    >
      <AuthButtonLink href={AUTH_ROUTES.login}>Back to sign in</AuthButtonLink>
    </AuthScreen>
  );
}
