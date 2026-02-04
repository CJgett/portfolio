"use client";
import { usePathname } from 'next/navigation';
import Menu from '../components/Menu.js';
import Header from '../components/Header.js';
import WasmBackground from '../components/WasmBackground.js'; // Import the WasmBackground component

export default function RootLayoutWrapper({ children, cormorantFontClass, homemadeAppleFontVariable }) {
  const pathname = usePathname();
  const isHomePage = pathname === '/';

  const appClassName = isHomePage ? "App home-page" : "App";

  return (
    <html lang="en" className={`${cormorantFontClass} ${homemadeAppleFontVariable}`}>
      <body> {/* Removed className="bg-img" */}
        <WasmBackground /> {/* Render the WASM background */}
        <div className={appClassName}>
          <Header />
          <main className="main-content">
            <div className="main-content-inner">
              {children}
            </div>
          </main>
          <Menu />
        </div>
      </body>
    </html>
  );
}
