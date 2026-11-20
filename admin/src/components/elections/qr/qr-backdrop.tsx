import { BuildingBackdrop } from "@/components/auth/building-backdrop";

/**
 * The QR viewer's background: the sign-in screen's navy page and 3D building, but calmer for a
 * screen that stays up all day. The glows are a still gradient (no fluid simulation, no
 * cursor light, no breathing dots), and the building is smaller, lower and fainter.
 */
export function QrBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-login-background">
      {/* Blue wash, as on the sign-in screen. */}
      <div className="absolute inset-0 bg-linear-to-b from-brand-blue/25 via-brand-blue/5 to-brand-blue/10" />

      {/* Still blue and gold glow behind the card, where the sign-in screen has the moving one. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_60%_at_88%_55%,rgb(15_76_158/0.38),transparent_70%),radial-gradient(ellipse_28%_38%_at_96%_12%,rgb(255_194_0/0.14),transparent_70%)]" />

      {/* Fine dot texture, fading out towards the edges. */}
      <div className="absolute inset-0 bg-dot-grid [mask-image:radial-gradient(ellipse_75%_85%_at_center,#000_40%,transparent_100%)]" />

      {/*
       * The rotating building: 25% smaller than on the sign-in screen (0.656 / 0.75 camera
       * distance), 25% less opaque, and moved down so it sits under the brand text.
       */}
      <BuildingBackdrop
        distanceScale={0.656 / 0.75}
        opacityClassName="opacity-30 lg:opacity-[0.375]"
        className="absolute inset-x-0 top-[12%] h-[60%] mask-b-from-50% lg:top-[20%] lg:right-auto lg:-bottom-[12%] lg:h-auto lg:w-3/4 lg:mask-b-from-80% lg:mask-r-from-85%"
      />
    </div>
  );
}
