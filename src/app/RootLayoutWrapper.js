"use client";
import { usePathname } from 'next/navigation';
import Menu from '../components/Menu.js';
import Header from '../components/Header.js';
import WasmBackground from '../components/WasmPointillistBG.js';
import PlayPauseButton from '../components/PlayPauseButton.js';
import LanguageToggle from '../components/LanguageToggle.js';
import { LanguageProvider } from '../i18n/LanguageContext.js';
import { AnimationProvider, useAnimation } from '../context/AnimationContext.js';

function AppLayout({ children, isHomePage, isTransparentPage, isPlayground }) {
  const { isFullscreen } = useAnimation();

  const appClassName = [
    "App",
    isHomePage && "home-page",
    isTransparentPage && "transparent-content-page",
    isFullscreen && "fullscreen",
  ].filter(Boolean).join(" ");

  return (
    <>
      {!isPlayground && <WasmBackground />}
      <PlayPauseButton disabled={isPlayground} />
      <LanguageToggle />
      <div className={appClassName}>
        <div className="header-wrap">
          <Header compact={!isHomePage} />
        </div>
        <main className="main-content">
          <div className="main-content-inner">
            {children}
          </div>
        </main>
        <div className="menu-wrap">
          <Menu />
        </div>
      </div>
    </>
  );
}

export default function RootLayoutWrapper({ children, cormorantFontClass, homemadeAppleFontVariable }) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';
  const isPlayground = pathname === '/playground';
  const isTransparentPage = pathname === '/projects' || pathname === '/misc' || isPlayground;

  return (
    <html lang="en" className={`${cormorantFontClass} ${homemadeAppleFontVariable}`}>
      <body>
        <LanguageProvider>
          <AnimationProvider>
            <AppLayout isHomePage={isHomePage} isTransparentPage={isTransparentPage} isPlayground={isPlayground}>
              {children}
            </AppLayout>
          </AnimationProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
