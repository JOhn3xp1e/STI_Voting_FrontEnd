import { cn } from "@/lib/utils";

import { BuildingBackdrop } from "./building-backdrop";
import { FluidField } from "./fluid-field";
import styles from "./login-effects.module.css";
import { PointerGlow } from "./pointer-glow";

/**
 * Decorative page background: navy base, blue wash, fluid glows, dot texture and cursor light.
 *
 * Alternate composition (`login-alt:`): the blue wash and the right-hand glow
 * fade away, and a live blue/gold fluid glow rises on the left, expanding
 * outward from the left edge; the mouse stirs it.
 */
export function LoginBackdrop() {
  return (
    // Own base colour: this layer is a stacking context, so the glow's `lighten` blend needs it.
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-login-background">
      {/* Blue wash behind the branding side. */}
      <div className="absolute inset-0 bg-linear-to-b from-brand-blue/25 via-brand-blue/5 to-brand-blue/10 transition-opacity login-alt:opacity-0" />

      {/*
       * While typing (white card, with the 3D building): a softer, mirrored fluid glow on
       * the right, behind the sign-in card. Stirred by the mouse like the one on the left.
       */}
      <FluidField
        activeVariant={1}
        mirror
        className={cn(
          "absolute inset-y-0 right-0 hidden w-2/5 mix-blend-lighten mask-l-from-60% lg:block",
          "opacity-20 transition-[opacity,scale] login-alt:scale-110 login-alt:opacity-0",
        )}
      />

      {/*
       * Alternate composition: the blue/gold fluid glow on the left, stirred by the mouse.
       * Small screens: kept behind the brand at the top, fading out before the form.
       * `lighten` lets only the glow's blue/gold add light: the simulation's dark
       * areas give way to the page's base colour instead of tinting it.
       */}
      <FluidField
        className={cn(
          "absolute top-0 left-0 h-[55%] w-full origin-left mix-blend-lighten mask-r-from-80% mask-b-from-35% lg:inset-y-0 lg:h-auto lg:w-[68.75%] lg:mask-b-from-100%",
          "scale-x-[0.55] opacity-0 transition-[opacity,scale] login-alt:scale-100 login-alt:opacity-50",
        )}
      />

      {/* Fine dot texture, fading out towards the edges. */}
      <div
        className={cn(
          "absolute inset-0 bg-dot-grid [mask-image:radial-gradient(ellipse_75%_85%_at_center,#000_40%,transparent_100%)]",
          styles.dotsBreathe,
        )}
      />

      {/*
       * The same dot grid over the fluid, so the glow sits behind the dots. `overlay`
       * makes them show up on the bright blue/gold while staying faint on the navy.
       * Same 24px grid from the same origin, so these dots line up with the ones above;
       * not scaled with the fluid, so they never smear during the composition switch.
       */}
      <div className="absolute top-0 left-0 h-[55%] w-full mix-blend-overlay mask-r-from-80% mask-b-from-35% lg:inset-y-0 lg:h-auto lg:w-[68.75%] lg:mask-b-from-100% opacity-0 transition-opacity login-alt:opacity-100">
        <div className={cn("absolute inset-0 bg-dot-grid [--dot-color:rgb(255_255_255/0.5)]", styles.dotsBreathe)} />
      </div>

      {/*
       * While typing (white card): the rotating building over the left three
       * quarters of the page. Small screens: behind the brand at the top.
       */}
      <BuildingBackdrop className="absolute inset-x-0 top-0 h-[55%] mask-b-from-50% lg:inset-y-0 lg:right-auto lg:h-auto lg:w-3/4 lg:mask-b-from-100% lg:mask-r-from-85%" />

      <PointerGlow />

      {/* After signing in: the navy base covers the glow and texture, so the dark card blends in. */}
      <div className={cn("absolute inset-0 bg-login-background", styles.backdropDim)} />
    </div>
  );
}
