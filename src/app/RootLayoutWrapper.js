"use client";
import { usePathname } from 'next/navigation';
import Menu from '../components/Menu.js';
import Header from '../components/Header.js';
import WasmBackground from '../components/WasmPointillistBG.js';
import PlayPauseButton from '../components/PlayPauseButton.js';
import LanguageToggle from '../components/LanguageToggle.js';
import { LanguageProvider } from '../i18n/LanguageContext.js';
import { AnimationProvider } from '../context/AnimationContext.js';

export default function RootLayoutWrapper({ children, cormorantFontClass, homemadeAppleFontVariable }) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  const isTransparentPage = pathname === '/projects' || pathname === '/misc';
  const appClassName = [
    "App",
    isHomePage && "home-page",
    isTransparentPage && "transparent-content-page",
  ].filter(Boolean).join(" ");

  return (
    <html lang="en" className={`${cormorantFontClass} ${homemadeAppleFontVariable}`}>
      <body>
        <LanguageProvider>
        <AnimationProvider>
          <WasmBackground />
          <PlayPauseButton />
          <LanguageToggle />
          <div className={appClassName}>
            <Header compact={!isHomePage} />
            <main className="main-content">
              <div className="main-content-inner">
                {children}
              </div>
            </main>
            <Menu />
          </div>
        </AnimationProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
