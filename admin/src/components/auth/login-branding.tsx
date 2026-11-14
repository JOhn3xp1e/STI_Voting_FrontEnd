import Image from "next/image";

import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";

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

/** Shared props so both map layers resolve to the same (cached) image file. */
const MAP_IMAGE = {
  src: "/images/image1.png",
  width: 1319,
  height: 889,
  loading: "eager",
  sizes: "(min-width: 1440px) 860px, (min-width: 1024px) 60vw, 90vw",
} as const;

/**
 * Gold pixel-art map with a slow drift and a periodic light sweep.
 * The outer element is positioned (and FLIP-animated on the composition
 * switch); the inner one carries the drift animation, so they never fight
 * over `transform`.
 *
 * Only shown with the form empty (dark composition); while typing, the large
 * rotating building takes over the background (see BuildingBackdrop).
 */
function MapIllustration({ className }: { className?: string }) {
  return (
    <div aria-hidden data-morph="map" className={cn("pointer-events-none select-none", className)}>
      {/* Own wrapper: the drift animation below also animates opacity. */}
      <div className="opacity-0 transition-opacity login-alt:opacity-100">
        <div className={styles.mapFloat}>
          <Image
            {...MAP_IMAGE}
            alt=""
            className="block w-full opacity-45 transition-opacity lg:opacity-55 lg:login-alt:opacity-75"
          />
          <div className={styles.mapSweepWindow}>
            <div className={styles.mapSweepInner}>
              <Image {...MAP_IMAGE} alt="" className="block w-full opacity-60" />
            </div>
          </div>
        </div>
      </div>
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
        // and the map anchors to the whole page (bottom-left) instead of this column.
        "lg:login-alt:static lg:login-alt:justify-center",
        className,
      )}
    >
      <MapIllustration
        className={cn(
          "absolute -top-12 -right-[15%] w-[85%] max-w-lg",
          // Desktop: the illustration fills the branding column, sitting just above the headline.
          "lg:top-auto lg:right-auto lg:bottom-16 lg:-left-[7.2%] lg:w-[115.6%] lg:max-w-none",
          // Alternate: spread along the bottom of the page, running off the lower edge.
          "lg:login-alt:top-[59%] lg:login-alt:bottom-auto lg:login-alt:left-0 lg:login-alt:w-[66%]",
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
