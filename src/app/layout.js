import localFont from 'next/font/local';

export const metadata = {
  title: "Carly Gettinger",
  description: "Carly Gettinger's personal portfolio — web developer based in Sydney, Australia.",
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};
import './globals.scss';
import RootLayoutWrapper from './RootLayoutWrapper.js';

// Font configuration
const cormorant = localFont({
  src: [
    {
      path: './fonts/CormorantInfant-VariableFont_wght.woff2',
      weight: '300 700',
      style: 'normal',
    },
    {
      path: './fonts/CormorantInfant-Italic-VariableFont_wght.woff2',
      weight: '300 700',
      style: 'italic',
    },
  ],
  display: 'swap',
  variable: '--font-cormorant',
});

const homemadeApple = localFont({
  src: './fonts/HomemadeApple-Regular.woff2',
  display: 'swap',
  variable: '--font-homemade-apple',
});

export default function RootLayout({ children }) {
  return (
    <RootLayoutWrapper
      cormorantFontClass={cormorant.variable}
      homemadeAppleFontVariable={homemadeApple.variable}
    >
      {children}
    </RootLayoutWrapper>
  );
}
