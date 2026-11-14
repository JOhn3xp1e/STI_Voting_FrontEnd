import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { CircleCheck, Info } from "lucide-react";

import { cn } from "@/lib/utils";

import { LoginBackdrop } from "./login-backdrop";
import { BrandMark, LoginHero } from "./login-branding";
import { LoginStage } from "./login-stage";

/**
 * Frame of the secondary auth screens (email links, account setup, password
 * reset): the sign-in screen's background in its white-card composition (the
 * rotating 3D ASCII building on the left, the fluid glow on the right, brand
 * at the top and headline at the bottom left), with the white card on the right.
 *
 * The card follows the Figma "SLVP · Admin" auth cards: 480 px wide, at least
 * 634 px tall, content centred vertically in one column with 20 px gaps
 * (illustration, title, description, body, footnote), and the pixel
 * decoration bleeding off the top-right corner.
 */
export function AuthScreen({
  title,
  description,
  children,
  footer,
  illustration,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Small print under the card's content, e.g. "Need help? Contact the MIS office." */
  footer?: ReactNode;
  /** Shown above the title on "done" cards. */
  illustration?: ReactNode;
}) {
  return (
    // Same page as the sign-in screen's white-card composition (while typing): the
    // rotating 3D building on the left, the fluid glow on the right behind the card.
    <LoginStage initialVariant={1} className="relative isolate flex flex-1 flex-col overflow-hidden bg-login-background">
      <LoginBackdrop />

      <div className="relative mx-auto flex w-full max-w-360 flex-1 flex-col px-4 py-8 sm:px-8 sm:py-12 lg:px-14 lg:py-10 xl:px-18">
        <BrandMark className="mx-auto w-full max-w-120 lg:absolute lg:top-16 lg:left-14 lg:mx-0 lg:w-auto lg:max-w-none xl:left-18 lg:login-alt:top-[calc(50%-6.25rem)]" />

        <div className="mt-10 flex flex-1 flex-col items-center gap-10 sm:mt-14 sm:gap-12 lg:mt-0 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:content-center lg:gap-14 xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-18">
          <LoginHero className="w-full max-w-120 lg:max-w-none lg:self-stretch lg:pb-9 lg:login-alt:pb-0" />
          <section
            aria-labelledby="auth-screen-title"
            // `data-login-variant="1"`: the dark composition's `login-alt:` styles stop here, so the fields keep their light look.
            data-login-variant="1"
            className="relative flex w-full max-w-120 flex-col justify-center overflow-hidden rounded-[1.25rem] bg-brand-white px-6 pt-28 pb-10 text-brand-navy shadow-2xl shadow-black/40 sm:min-h-[39.625rem] sm:px-12 sm:py-[1.875rem] lg:my-6"
          >
            <Image
              src="/images/image2.png"
              alt=""
              aria-hidden
              width={289}
              height={212}
              className="pointer-events-none absolute -top-[5.375rem] -right-32 h-[13.25rem] w-[18.0625rem] max-w-none select-none"
            />
            <div className="relative flex flex-col gap-5">
              {illustration ? <div className="flex justify-center">{illustration}</div> : null}
              <h1 id="auth-screen-title" className="text-[1.75rem] leading-tight font-semibold tracking-tight sm:text-3xl">
                {title}
              </h1>
              {description ? <div className="text-sm text-brand-muted">{description}</div> : null}
              {children}
              {footer ? <div className="text-center text-xs text-brand-muted">{footer}</div> : null}
            </div>
          </section>
        </div>
      </div>
    </LoginStage>
  );
}

/** "Approved" owl with a check badge, for the done cards ("Password updated", "You're in"). */
export function ApprovedOwl() {
  return (
    <span aria-hidden className="relative block h-[6.675rem] w-[5.925rem]">
      <Image src="/images/owlie-approved.png" alt="" fill sizes="95px" className="object-cover" />
      <span className="absolute right-[0.1375rem] bottom-[0.2125rem] size-6">
        {/* The badge's shadow extends past its 24 px circle. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/check-badge.svg" alt="" width={34.8} height={34.8} className="absolute -top-[0.2625rem] -left-[0.3375rem] max-w-none" />
      </span>
    </span>
  );
}

/** Message box inside an auth card. `info` for problems and notes, `success` for done states. */
export function AuthAlert({ tone = "info", children, className }: { tone?: "info" | "success"; children: ReactNode; className?: string }) {
  const Icon = tone === "success" ? CircleCheck : Info;
  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      className={cn(
        "flex gap-2.5 rounded-md border px-3 py-2.5 text-xs leading-5 text-brand-navy",
        tone === "success" ? "border-emerald-600/20 bg-emerald-600/5" : "border-brand-blue/20 bg-brand-blue/5",
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "success" ? "text-emerald-600" : "text-brand-blue")} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** The dark primary button of the auth cards (same look as "Sign in"). */
export const authPrimaryButtonClassName = cn(
  "h-[2.125rem] w-full rounded-md bg-brand-background text-[0.8125rem] font-semibold text-brand-white",
  "duration-200 ease-out focus-visible:border-brand-blue focus-visible:ring-brand-blue/40",
  "hover:-translate-y-px hover:bg-[color-mix(in_oklab,var(--color-brand-background)_84%,var(--color-brand-blue))]",
  "hover:shadow-[0_10px_24px_-12px_color-mix(in_oklab,var(--color-brand-blue)_90%,transparent)]",
  "motion-reduce:hover:translate-y-0",
);

/** Outlined secondary button of the auth cards (e.g. "Sign up with Google"). */
export const authSecondaryButtonClassName = cn(
  "h-10 w-full gap-2.5 rounded-md border-[#e4e8f0] bg-brand-white text-[0.8125rem] font-semibold text-brand-navy",
  "duration-200 ease-out hover:border-brand-navy/25 hover:bg-[#f5f7fb] hover:text-brand-navy",
  "focus-visible:border-brand-blue focus-visible:ring-brand-blue/30",
);

/** A link that looks like the primary button (e.g. "Back to sign in" on the expired-link cards). */
export function AuthButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        authPrimaryButtonClassName,
        "inline-flex items-center justify-center gap-1.5 transition-all outline-none focus-visible:ring-3",
      )}
    >
      {children}
    </Link>
  );
}

const linkClassName =
  "rounded-sm font-semibold text-brand-blue outline-none hover:underline hover:underline-offset-4 focus-visible:ring-3 focus-visible:ring-brand-blue/30";

/** Inline text link of the auth cards. */
export function AuthLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} prefetch={false} className={cn(linkClassName, className)}>
      {children}
    </Link>
  );
}

/** Text-styled button of the auth cards (e.g. "Use a different email"). */
export function AuthTextButton({
  onClick,
  disabled,
  children,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(linkClassName, "disabled:pointer-events-none disabled:font-normal disabled:text-brand-muted", className)}
    >
      {children}
    </button>
  );
}

/** Placeholder line while a screen checks the session. */
export function AuthChecking({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-brand-muted">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-brand-navy/15 border-t-brand-blue" />
      {label}
    </p>
  );
}
