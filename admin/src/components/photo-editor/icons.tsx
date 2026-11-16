import type { SVGProps } from "react";

/* Icons from the "Photo editor · AI test" Figma frame, drawn in currentColor. */

type IconProps = SVGProps<SVGSVGElement>;

function Stroke({ box = 16, weight = 1.5, children, ...props }: IconProps & { box?: number; weight?: number }) {
  return (
    <svg
      aria-hidden
      width={box}
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ChevronLeftIcon = (p: IconProps) => (
  <Stroke weight={1.6} {...p}>
    <path d="M10 3L5 8L10 13" />
  </Stroke>
);

export const CheckIcon = (p: IconProps) => (
  <Stroke box={10} weight={1.66667} {...p}>
    <path d="M2.08333 5.16667L4.08333 7.08333L7.91667 2.91667" />
  </Stroke>
);

export const CheckBoldIcon = (p: IconProps) => (
  <Stroke box={14} weight={2.33333} {...p}>
    <path d="M2.91667 7.23333L5.71667 9.91667L11.0833 4.08333" />
  </Stroke>
);

export const SplitArrowsIcon = (p: IconProps) => (
  <Stroke box={18} weight={1.6} {...p}>
    <path d="M6 5L2 9L6 13M12 5L16 9L12 13" />
  </Stroke>
);

export const ZoomOutIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 8H12" />
  </Stroke>
);

export const ZoomInIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 8H8M8 8H12M8 8V4M8 8V12" />
  </Stroke>
);

export const RotateIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M3 8C2.98351 9.15754 3.3692 10.2849 4.09125 11.1898C4.81331 12.0947 5.82698 12.721 6.95931 12.9618C8.09164 13.2027 9.27245 13.0431 10.3003 12.5104C11.3281 11.9777 12.1392 11.1049 12.5952 10.0408C13.0512 8.97675 13.1239 7.78743 12.8008 6.67577C12.4777 5.56411 11.7789 4.59901 10.8236 3.94514C9.86828 3.29128 8.71568 2.98916 7.56245 3.09035C6.40923 3.19154 5.32685 3.68976 4.5 4.5" />
    <path d="M3 2.5V5H5.5" />
  </Stroke>
);

export const FlipIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M8 2V14" />
    <path d="M5 4L2 12H5V4Z" />
    <path d="M11 4L14 12H11V4Z" />
  </Stroke>
);

export const EyedropperIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M10.5 2.5L13.5 5.5L12 7L9 4L10.5 2.5Z" />
    <path d="M9 4L3 10V13H6L12 7" />
  </Stroke>
);

export const SparkleIcon = ({ size = 12, ...p }: IconProps & { size?: 12 | 16 }) =>
  size === 16 ? (
    <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M8 1.33333L9.6 6.4L14.6667 8L9.6 9.6L8 14.6667L6.4 9.6L1.33333 8L6.4 6.4L8 1.33333Z" />
    </svg>
  ) : (
    <svg aria-hidden width={12} height={12} viewBox="0 0 12 12" fill="currentColor" {...p}>
      <path d="M6 1L7.2 4.8L11 6L7.2 7.2L6 11L4.8 7.2L1 6L4.8 4.8L6 1Z" />
    </svg>
  );
