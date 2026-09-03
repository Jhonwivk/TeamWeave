import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TeamWeave — Agent Work Console",
  description: "Route tasks to agents and workers, inspect execution, and keep every delivery under human control.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body className="antialiased">{children}</body></html>;
}
