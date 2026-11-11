import Image from "next/image";

import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";

/** Path to the SLVP/STI logo in `public/images/` (rendered at 40×40). */
const STI_LOGO_SRC: string | null = "/images/slvp logo.png";

/** STI logo and portal name shown at the top of the auth screens. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-h-10 items-center gap-3", className)}>
      {STI_LOGO_SRC ? (
        <Image src={STI_LOGO_SRC} alt="STI" width={40} height={40} className="size-10 object-contain" />
      ) : null}
      <p className="font-display text-base font-semibold text-brand-white sm:text-lg">
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

/** Gold pixel-art map with a slow drift and a periodic light sweep. */
function MapIllustration({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none select-none", styles.mapFloat, className)}>
      <Image {...MAP_IMAGE} alt="" className="block w-full opacity-45 lg:opacity-55" />
      <div className={styles.mapSweepWindow}>
        <div className={styles.mapSweepInner}>
          <Image {...MAP_IMAGE} alt="" className="block w-full opacity-60" />
        </div>
      </div>
    </div>
  );
}

/** Pixel-art illustration with the portal headline. */
export function LoginHero({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex flex-col justify-end", className)}>
      <MapIllustration
        className={cn(
          "absolute -top-12 -right-[15%] w-[85%] max-w-lg",
          // Desktop: the illustration fills the branding column, sitting just above the headline.
          "lg:top-auto lg:right-auto lg:bottom-16 lg:-left-[7.2%] lg:w-[115.6%] lg:max-w-none",
        )}
      />
      <div className="relative">
        <p className="font-display text-[1.75rem] leading-tight font-bold text-brand-gold sm:text-3xl xl:text-4xl">
          Manage campus elections.
        </p>
        <p className="mt-3 text-sm text-brand-white/70 sm:text-[0.9375rem] lg:mt-4">
          Manage terms, elections, candidates and voters in one place.
        </p>
      </div>
    </div>
  );
}
