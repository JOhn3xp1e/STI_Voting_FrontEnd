import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";

import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { cn } from "@/lib/utils";

import "./globals.css";

const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fontMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

/** Display face for brand marks and hero headlines (`font-display`). */
const fontDisplay = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Admin Portal",
    template: "%s | Admin Portal",
  },
  description: "Administration portal for the Voting System.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The theme script below sets `data-theme` before hydration.
      suppressHydrationWarning
      className={cn(fontSans.variable, fontMono.variable, fontDisplay.variable, "h-full antialiased")}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
