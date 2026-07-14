import { Link } from 'react-router-dom';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <p className="app-eyebrow">Mech Commander</p>
            <h1 className="app-title">Community Scenario Repository</h1>
          </div>
          <nav className="app-nav" aria-label="Main navigation">
            <Link to="/">Catalogue</Link>
            <Link to="/upload">Upload</Link>
            <Link to="/api">API</Link>
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <p>Community scenarios for Mech Commander. Packages are validated server-side.</p>
      </footer>
    </div>
  );
}
