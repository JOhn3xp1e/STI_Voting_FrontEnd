import Image from "next/image";

import { cn } from "@/lib/utils";

import { HeroBuilding } from "./hero-building";

/** Path to the SLVP/STI logo in `public/images/` (rendered at 40×40). */
const STI_LOGO_SRC: string | null = "/images/slvp logo.png";

/**
 * STI logo and portal name shown at the top of the auth screens.
 * In the alternate composition the name grows into a large title (`data-morph`
 * lets the switch animate it from one size and position to the other).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-10 items-center gap-3", className)}>
      {STI_LOGO_SRC ? (
        <Image
          data-morph="brand-logo"
          src={STI_LOGO_SRC}
          alt="STI"
          width={40}
          height={40}
          className="size-10 object-contain"
        />
      ) : null}
      <p
        data-morph="brand-text"
        className="font-display text-base font-semibold whitespace-nowrap text-brand-white sm:text-lg login-alt:text-[1.75rem] login-alt:leading-tight sm:login-alt:text-3xl xl:login-alt:text-[2.375rem]"
      >
        SLVP · Admin Portal
      </p>
    </div>
  );
}

/** Pixel-art illustration with the portal headline. */
export function LoginHero({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-end",
        // Alternate composition: the headline is centred under the large brand,
        // and the building spreads over the page instead of this column.
        "lg:login-alt:static lg:login-alt:justify-center",
        className,
      )}
    >
      <HeroBuilding
        className={cn(
          "absolute -top-12 -right-[15%] aspect-[3/2] w-[85%] max-w-lg opacity-50",
          // Desktop: fills the branding column, sitting just above the headline.
          "lg:top-auto lg:right-auto lg:bottom-24 lg:-left-[7.2%] lg:w-[115.6%] lg:max-w-none lg:opacity-75",
          // Alternate: the left three quarters of the page, softer so the large headline stays readable.
          "lg:login-alt:inset-y-0 lg:login-alt:left-0 lg:login-alt:aspect-auto lg:login-alt:w-3/4 lg:login-alt:opacity-50 lg:login-alt:mask-r-from-65%",
        )}
      />
      <div data-morph="hero-text" className="relative">
        <p className="font-display text-[1.75rem] leading-tight font-bold text-brand-gold sm:text-3xl xl:text-4xl">
          Manage campus elections.
        </p>
        <p className="mt-3 text-sm text-brand-white/70 transition-colors sm:text-[0.9375rem] lg:mt-4 login-alt:text-brand-white/60">
          Manage terms, elections, candidates and voters in one place.
        </p>
      </div>
    </div>
  );
}
