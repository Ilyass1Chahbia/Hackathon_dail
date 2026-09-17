import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

// Geometric sans, self-hosted by Next.js at build time (no external font requests at runtime).
const geometric = Outfit({
  subsets: ["latin"],
  variable: "--font-geometric",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Octopus C04 · Receipt capture & discrepancy review",
  description:
    "Deterministic receipt-to-invoice reconciliation prototype for Octopus case C04. Synthetic exercise data only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geometric.variable}>
      <body className="min-h-screen font-sans">
        {/* Decorative aurora/mesh backdrop: aria-hidden, fixed, behind all content. */}
        <div aria-hidden="true" className="aurora">
          <span className="aurora-blob aurora-coral" />
          <span className="aurora-blob aurora-violet" />
          <span className="aurora-blob aurora-blue" />
        </div>
        {children}
      </body>
    </html>
  );
}
