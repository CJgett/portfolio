import Link from 'next/link';
import './Header.css';

function Header({ compact = false }) {
  return (
    <Link href="/" className={`header-link${compact ? ' header-compact' : ''}`}>
      <div className="header-container">
        <h1>Carly Gettinger</h1>
        <p className="header-subtitle">Web Dev</p>
      </div>
    </Link>
  );
}

export default Header;
