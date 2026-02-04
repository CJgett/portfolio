import Link from 'next/link';

function MenuButton({link, text, isActive}) {
  const linkClassName = isActive ? "menu-item active-link" : "menu-item";
  return (
    <Link href={link} className={linkClassName}>
      {text}
    </Link>
  );
}

export default MenuButton;
