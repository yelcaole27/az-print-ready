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
    var stored = localStorage.getItem('azpr-theme') || 'dark';
    var isDark = stored === 'dark' || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
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
      <body className="bg-bg text-text antialiased">
        {children}
      </body>
    </html>
  );
}
