"use client";
import { usePathname } from 'next/navigation';
import Menu from '../components/Menu.js';
import Header from '../components/Header.js';
import WasmBackground from '../components/WasmPointillistBG.js';
import LanguageToggle from '../components/LanguageToggle.js';
import { LanguageProvider } from '../i18n/LanguageContext.js';

export default function RootLayoutWrapper({ children, cormorantFontClass, homemadeAppleFontVariable }) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  const appClassName = isHomePage ? "App home-page" : "App";

  return (
    <html lang="en" className={`${cormorantFontClass} ${homemadeAppleFontVariable}`}>
      <body>
        <LanguageProvider>
          <WasmBackground />
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
        </LanguageProvider>
      </body>
    </html>
  );
}
