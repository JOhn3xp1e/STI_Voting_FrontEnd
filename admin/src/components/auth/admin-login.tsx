import { LoginBackdrop } from "./login-backdrop";
import { BrandMark, LoginHero } from "./login-branding";
import { LoginCard } from "./login-card";
import { LoginStage } from "./login-stage";

/**
 * Admin sign-in screen: branding on the left, sign-in card on the right.
 *
 * Two compositions share this markup and morph between them (see LoginStage):
 * the dark one while the form is empty or after signing in, the white card
 * while typing (chosen in LoginCard). `login-alt:` classes describe the dark composition: brand
 * and headline centred on the left over the blue/gold glow, pixel map along
 * the bottom, and the form without its white card.
 *
 * After signing in, `.stage` fades everything out to the navy base before the
 * dashboard's entrance takes over.
 */
export function AdminLogin() {
  return (
    <LoginStage className="relative isolate flex flex-1 flex-col overflow-hidden bg-login-background">
      <LoginBackdrop />

      <div className="relative mx-auto flex w-full max-w-360 flex-1 flex-col px-4 py-8 sm:px-8 sm:py-12 lg:px-14 lg:py-10 xl:px-18">
        <BrandMark className="mx-auto w-full max-w-120 lg:absolute lg:top-16 lg:left-14 lg:mx-0 lg:w-auto lg:max-w-none xl:left-18 lg:login-alt:top-[calc(50%-6.25rem)]" />

        <div className="mt-10 flex flex-1 flex-col items-center gap-10 sm:mt-14 sm:gap-12 lg:mt-0 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:content-center lg:gap-14 xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-18">
          <LoginHero className="w-full max-w-120 lg:max-w-none lg:self-stretch lg:pb-9 lg:login-alt:pb-0" />
          <LoginCard className="max-w-120" />
        </div>
      </div>
    </LoginStage>
  );
}
