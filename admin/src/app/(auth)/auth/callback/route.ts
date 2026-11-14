import { NextResponse, type NextRequest } from "next/server";

import { AUTH_ROUTES, loginHref, safeNext } from "@/lib/auth-routing";
import { createRouteClient } from "@/lib/supabase/server";

/**
 * Where Google sends people back, both for signing in and for linking Google
 * on the accept-invite page. Exchanges the one-time code for a session (saved
 * in cookies) and continues to `next`; signing in continues to
 * `/auth/after-login`, which asks the backend where this login belongs.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next")) ?? AUTH_ROUTES.afterLogin;
  const linking = next.startsWith(AUTH_ROUTES.acceptInvite);

  if (code) {
    const response = NextResponse.redirect(new URL(next, url.origin));
    const { error } = await createRouteClient(request, response).auth.exchangeCodeForSession(code);
    if (!error) return response;
  }

  // Errors from Google or Supabase arrive as ?error=…&error_description=…
  // Linking: back to the accept page, which explains it. Signing in: usually an
  // account that was never invited or linked, so the not-invited message.
  const failure = linking ? `${AUTH_ROUTES.acceptInvite}?google=failed` : loginHref("not_invited");
  return NextResponse.redirect(new URL(failure, url.origin));
}
