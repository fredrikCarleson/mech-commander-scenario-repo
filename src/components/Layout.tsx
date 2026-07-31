import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getAdminToken } from '../api/admin-client.ts';

export function Layout({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      setIsAdmin(!!getAdminToken());
    };
    checkAuth();
    window.addEventListener('auth-change', checkAuth);
    return () => window.removeEventListener('auth-change', checkAuth);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-eyebrow">Meridian Strike</p>
            <h1 className="app-title">Community Scenario Repository</h1>
          </div>
          <nav className="app-nav" aria-label="Main navigation">
            <Link to="/">Catalogue</Link>
            <Link to="/wiki">Wiki</Link>
            {isAdmin && <Link to="/upload">Upload</Link>}
            <Link to="/admin">Admin</Link>
            {isAdmin && <Link to="/api">API</Link>}
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p>Community scenarios for Meridian Strike. Packages are validated server-side.</p>
      </footer>
    </div>
  );
}
