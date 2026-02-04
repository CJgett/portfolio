import Link from 'next/link'; 
import './Header.css';

function Header() {
  return (
    <Link href="/" className="header-link">
      <div className="header-container">
        <h1>Carly Gettinger</h1>
        <p>Web Dev</p>
      </div>
    </Link>
  );
}

export default Header;
