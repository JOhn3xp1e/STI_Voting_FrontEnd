import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";
import { LoginBackdrop } from "./login-backdrop";
import { BrandMark, LoginHero } from "./login-branding";
import { LoginCard } from "./login-card";

/**
 * Admin sign-in screen: branding on the left, sign-in card on the right.
 * After signing in, `.stage` fades everything out to the navy base before the
 * dashboard's entrance takes over.
 */
export function AdminLogin() {
  return (
    <main className={cn("relative isolate flex flex-1 flex-col overflow-hidden bg-brand-background", styles.stage)}>
      <LoginBackdrop />

      <div className="relative mx-auto flex w-full max-w-360 flex-1 flex-col px-4 py-8 sm:px-8 sm:py-12 lg:px-14 lg:py-10 xl:px-18">
        <BrandMark className="mx-auto w-full max-w-120 lg:absolute lg:top-16 lg:left-14 lg:mx-0 lg:w-auto lg:max-w-none xl:left-18" />

        <div className="mt-10 flex flex-1 flex-col items-center gap-10 sm:mt-14 sm:gap-12 lg:mt-0 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:content-center lg:gap-14 xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-18">
          <LoginHero className="w-full max-w-120 lg:max-w-none lg:self-stretch lg:pb-9" />
          <LoginCard className="max-w-120" />
        </div>
      </div>
    </main>
  );
}
