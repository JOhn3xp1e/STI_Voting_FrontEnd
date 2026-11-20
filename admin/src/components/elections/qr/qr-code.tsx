"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

/** A QR code as crisp SVG squares (dark on white), with a two-module quiet zone. */
export function QrCode({ value, size = 300, label = "QR code", className }: { value: string; size?: number; label?: string; className?: string }) {
  const { count, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
    let d = "";
    for (let y = 0; y < modules.size; y += 1) {
      for (let x = 0; x < modules.size; x += 1) {
        if (modules.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { count: modules.size, path: d };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`-2 -2 ${count + 4} ${count + 4}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x={-2} y={-2} width={count + 4} height={count + 4} fill="#ffffff" />
      <path d={path} fill="#0f172a" />
    </svg>
  );
}
