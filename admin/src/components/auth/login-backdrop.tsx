import Image from "next/image";

import { cn } from "@/lib/utils";

import styles from "./login-effects.module.css";
import { PointerGlow } from "./pointer-glow";

/** Decorative page background: navy base, blue wash, glow artwork, dot texture and cursor light. */
export function LoginBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Blue wash behind the branding side. */}
      <div className="absolute inset-0 bg-linear-to-b from-brand-blue/25 via-brand-blue/5 to-brand-blue/10" />

      {/* Gold and blue glow artwork, mirrored so the glow sits behind the sign-in card. */}
      <div className="absolute inset-y-0 right-0 hidden w-2/5 mask-l-from-60% lg:block">
        <Image
          src="/images/bglogin.png"
          alt=""
          fill
          loading="eager"
          sizes="40vw"
          className="-scale-x-100 object-cover object-left opacity-30"
        />
      </div>

      <div className={cn("absolute inset-0 bg-dot-grid", styles.dotsBreathe)} />

      <PointerGlow />
    </div>
  );
}
