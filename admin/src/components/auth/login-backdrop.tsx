import Image from "next/image";

import { cn } from "@/lib/utils";

import { GlowField } from "./glow-field";
import styles from "./login-effects.module.css";
import { PointerGlow } from "./pointer-glow";

/**
 * Same props for both glow layers so they share one cached image file.
 * `bglogin-glow.png` is `bglogin.png` with its baked-in dot grid removed: the
 * glow layer stretches while the composition switches, which smeared those
 * dots. The page's own dot texture (`bg-dot-grid`, below) is never scaled.
 */
const GLOW_IMAGE = { src: "/images/bglogin-glow.png", fill: true, loading: "eager", sizes: "40vw" } as const;

/**
 * Decorative page background: navy base, blue wash, glow artwork, dot texture and cursor light.
 *
 * Alternate composition (`login-alt:`): the blue wash and the right-hand glow
 * fade away, and the same glow artwork rises in full strength on the left,
 * expanding outward from the left edge.
 */
export function LoginBackdrop() {
  return (
    // Own base colour: this layer is a stacking context, so the glow's `lighten` blend needs it.
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-login-background">
      {/* Blue wash behind the branding side. */}
      <div className="absolute inset-0 bg-linear-to-b from-brand-blue/25 via-brand-blue/5 to-brand-blue/10 transition-opacity login-alt:opacity-0" />

      {/* Gold and blue glow artwork, mirrored so the glow sits behind the sign-in card. */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 hidden w-2/5 mask-l-from-60% lg:block",
          "transition-[opacity,scale] login-alt:scale-110 login-alt:opacity-0",
        )}
      >
        <Image {...GLOW_IMAGE} alt="" className="-scale-x-100 object-cover object-left opacity-30" />
      </div>

      {/*
       * Alternate composition: the full glow on the left (the artwork's own left 69%),
       * as separate gold and blue layers that drift apart around the cursor.
       * Small screens: kept behind the brand at the top, fading out before the form.
       * `lighten` lets only the glow's blue/gold add light: the artwork's own dark
       * navy areas give way to the page's base colour instead of tinting it.
       */}
      <GlowField
        className={cn(
          "absolute top-0 left-0 h-[55%] w-full origin-left mix-blend-lighten mask-r-from-80% mask-b-from-35% lg:inset-y-0 lg:h-auto lg:w-[68.75%] lg:mask-b-from-100%",
          "scale-x-[0.55] opacity-0 transition-[opacity,scale] login-alt:scale-100 login-alt:opacity-100",
        )}
      />

      {/* Fine dot texture, fading out towards the edges. */}
      <div
        className={cn(
          "absolute inset-0 bg-dot-grid [mask-image:radial-gradient(ellipse_75%_85%_at_center,#000_40%,transparent_100%)]",
          styles.dotsBreathe,
        )}
      />

      <PointerGlow />

      {/* After signing in: the navy base covers the glow and texture, so the dark card blends in. */}
      <div className={cn("absolute inset-0 bg-login-background", styles.backdropDim)} />
    </div>
  );
}
