"use client";
import { usePathname } from 'next/navigation';
import { useLanguage } from '../i18n/LanguageContext';
import MenuButton from './MenuButton.js';
import './Menu.scss';

function Menu() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <nav className="main-menu">
      <ul>
       <li><MenuButton link="/projects" text={t("menu.projects")} isActive={pathname === '/projects'}/></li>
       <li><MenuButton link="/bio" text={t("menu.bio")} isActive={pathname === '/bio'}/></li>
       <li><MenuButton link="/misc" text={t("menu.misc")} isActive={pathname === '/misc'}/></li>
      </ul>
    </nav>
  );
}

export default Menu;
