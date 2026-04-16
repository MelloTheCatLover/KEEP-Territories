import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ChevronDown, User, LogOut } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const navLinks = [
  { to: '/map', label: 'Карта' },
  { to: '/team', label: 'Команда' },
  { to: '/admin/submissions', label: 'Админ', adminOnly: true },
];

function navLinkClass({ isActive }: { isActive: boolean }) {
  const base = 'text-sm font-medium px-3 py-2 rounded-sm transition-colors';
  return isActive
    ? `${base} text-brand-400 bg-brand-900/30`
    : `${base} text-neutral-700 hover:text-neutral-1000 hover:bg-neutral-200`;
}

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <header className="h-14 border-b border-neutral-300 bg-neutral-100 px-5 flex items-center justify-between sticky top-0 z-[100]">
      <Link to="/map" className="font-display font-bold text-base text-neutral-1000 tracking-wide">
        ТЕРРИТОРИИ
      </Link>

      <nav className="flex items-center gap-1">
        {navLinks
          .filter((link) => !link.adminOnly || user?.role === 'admin')
          .map((link) => (
          <NavLink key={link.to} to={link.to} className={navLinkClass}>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div ref={wrapperRef} className="relative">
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-2 px-2 py-1 rounded-sm hover:bg-neutral-200 transition-colors"
        >
          <span className="bg-brand-700 text-neutral-1000 w-8 h-8 rounded-full font-semibold text-sm flex items-center justify-center">
            {user?.username?.charAt(0).toUpperCase() ?? '?'}
          </span>
          <span className="text-sm text-neutral-900">{user?.username ?? ''}</span>
          <ChevronDown className="w-4 h-4 text-neutral-700" />
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-glass-strong backdrop-blur-glass border border-glass rounded-md shadow-3 py-1 z-[1000]">
            <button
              onClick={() => { navigate('/profile'); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-left text-neutral-900 hover:bg-neutral-300 transition-colors flex items-center gap-2"
            >
              <User className="w-4 h-4" />
              Профиль
            </button>
            <button
              onClick={() => { logout(); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-left text-neutral-900 hover:bg-neutral-300 transition-colors flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
