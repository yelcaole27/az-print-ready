import type { Metadata } from "next";
import { googleFontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "AZ Print Ready",
  description: "Browser-based tool for print shops that turns images and text into print-ready pages.",
};

const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('azpr-theme') || 'system';
    var isDark = stored === 'dark' || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={googleFontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans bg-surface text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
