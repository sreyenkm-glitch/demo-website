import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ACCENTS, getSettings } from "@/lib/settings";
import "./globals.css";

// Every page reads the database (settings, session), so never pre-render at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  return {
    title: { default: s.brand.name, template: `%s · ${s.brand.name}` },
    description: s.brand.tagline,
    icons: { icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='28' fill='%23c8ff2e'/><text x='50' y='70' font-size='58' text-anchor='middle' font-family='Arial' font-weight='900'>↻</text></svg>" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
    { media: "(prefers-color-scheme: light)", color: "#f3f0e8" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  const jar = await cookies();
  const pref = jar.get("obsa_theme")?.value;
  const theme = pref === "light" || pref === "dark" || pref === "system" ? pref : settings.theme.mode;
  const accent = ACCENTS[settings.theme.accent] ?? ACCENTS.lime;
  return (
    <html lang="en" data-theme={theme} style={{ ["--accent" as string]: accent.value, ["--accent-ink" as string]: accent.ink }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
