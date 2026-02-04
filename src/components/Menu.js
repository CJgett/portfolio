"use client";
import { usePathname } from 'next/navigation';
import MenuButton from './MenuButton.js';
import './Menu.css';

function Menu() {
  const pathname = usePathname();

  return (
    <nav className="main-menu">
      <ul>
       <li><MenuButton link="/bio" text="Bio" isActive={pathname === '/bio'}/></li> 
       <li><MenuButton link="/projects" text="Projects" isActive={pathname === '/projects'}/></li> 
       <li><MenuButton link="/misc" text="Misc" isActive={pathname === '/misc'}/></li> 
      </ul>
    </nav>
  );
}

export default Menu;
