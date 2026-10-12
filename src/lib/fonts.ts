import {
  Inter,
  Roboto,
  Open_Sans,
  Montserrat,
  Poppins,
  Lora,
  Playfair_Display,
  Oswald,
  Dancing_Script,
} from 'next/font/google';

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
});

export const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
  display: 'swap',
});

export const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const poppins = Poppins({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-poppins',
  display: 'swap',
});

export const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
});

export const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-display',
  display: 'swap',
});

export const oswald = Oswald({
  subsets: ['latin'],
  variable: '--font-oswald',
  display: 'swap',
});

export const dancingScript = Dancing_Script({
  subsets: ['latin'],
  variable: '--font-dancing-script',
  display: 'swap',
});

export const googleFontVariables = [
  inter.variable,
  roboto.variable,
  openSans.variable,
  montserrat.variable,
  poppins.variable,
  lora.variable,
  playfairDisplay.variable,
  oswald.variable,
  dancingScript.variable,
].join(' ');

export interface FontOption {
  name: string;
  family: string;
}

export const FONT_OPTIONS: FontOption[] = [
  // System fonts with generic fallbacks
  { name: 'Arial', family: 'Arial, Helvetica, sans-serif' },
  { name: 'Calibri', family: 'Calibri, Candara, Segoe, "Segoe UI", Optima, Arial, sans-serif' },
  { name: 'Times New Roman', family: '"Times New Roman", Times, Baskerville, Georgia, serif' },
  { name: 'Georgia', family: 'Georgia, Times, "Times New Roman", serif' },
  { name: 'Verdana', family: 'Verdana, Geneva, sans-serif' },
  { name: 'Courier New', family: '"Courier New", Courier, monospace' },

  // Google fonts via CSS variables
  { name: 'Inter', family: 'var(--font-inter), sans-serif' },
  { name: 'Roboto', family: 'var(--font-roboto), sans-serif' },
  { name: 'Open Sans', family: 'var(--font-open-sans), sans-serif' },
  { name: 'Montserrat', family: 'var(--font-montserrat), sans-serif' },
  { name: 'Poppins', family: 'var(--font-poppins), sans-serif' },
  { name: 'Lora', family: 'var(--font-lora), serif' },
  { name: 'Playfair Display', family: 'var(--font-playfair-display), serif' },
  { name: 'Oswald', family: 'var(--font-oswald), sans-serif' },
  { name: 'Dancing Script', family: 'var(--font-dancing-script), cursive' },
];

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96];

export const LINE_SPACINGS = [
  { label: '1.0', value: '1.0' },
  { label: '1.15', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2.0' },
];
