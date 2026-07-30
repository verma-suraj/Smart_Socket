import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { truncateDisplayName } from '../../utils/formatters';

interface NavShellProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  path: string;
  icon: string;
  primary: boolean; // primary items show in bottom nav on mobile
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Node Overview', path: '/', icon: '🔌', primary: true },
  { label: 'Active Sessions', path: '/sessions/active', icon: '⚡', primary: true },
  { label: 'Session History', path: '/sessions/history', icon: '📋', primary: true },
  { label: 'User Profile', path: '/profile', icon: '👤', primary: false },
  { label: 'Node Management', path: '/nodes/manage', icon: '🔧', primary: false },
  { label: 'ALM Control', path: '/alm', icon: '📊', primary: false },
  { label: 'Event Log', path: '/events', icon: '📝', primary: false },
  { label: 'Guest Session', path: '/guest-session', icon: '🎫', primary: false },
];

/** Maps route paths to breadcrumb labels */
const BREADCRUMB_MAP: Record<string, { parent: string; parentPath: string; label: string }> = {
  '/nodes/': { parent: 'Nodes', parentPath: '/', label: 'Node Detail' },
};

function getBreadcrumb(pathname: string): { parent: string; parentPath: string; label: string } | null {
  for (const [prefix, breadcrumb] of Object.entries(BREADCRUMB_MAP)) {
    if (pathname.startsWith(prefix) && pathname !== prefix) {
      return breadcrumb;
    }
  }
  return null;
}

function getPageTitle(pathname: string): string {
  const item = NAV_ITEMS.find((i) => i.path === pathname);
  if (item) return item.label;
  if (pathname.startsWith('/nodes/') && pathname !== '/nodes/manage') return 'Node Detail';
  return 'Dashboard';
}

/**
 * Responsive Navigation Shell.
 * - Desktop (≥1024px): Sidebar with all navigation items
 * - Tablet (768px–1023px): Hamburger menu that expands on click
 * - Mobile (<768px): Bottom navigation bar for primary items + hamburger for secondary
 */
export default function NavShell({ children }: NavShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();

  const displayName = user?.displayName || user?.email || 'User';
  const truncatedName = truncateDisplayName(displayName);
  const breadcrumb = getBreadcrumb(location.pathname);
  const pageTitle = getPageTitle(location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    setMenuOpen(false);
  };

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg text-base min-h-[44px] min-w-[44px] transition-colors ${
      isActive
        ? 'bg-primary/20 text-primary font-semibold'
        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
    }`;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-900 text-white">
      {/* ═══════════════ Desktop Sidebar (≥1024px) ═══════════════ */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-gray-800 border-r border-gray-700">
        {/* Logo / Brand */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-700">
          <span className="text-xl font-bold text-primary">⚡ Smart Socket</span>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={navLinkClasses}
            >
              <span className="text-lg" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info + logout at bottom */}
        <div className="border-t border-gray-700 px-4 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300 truncate max-w-[160px]" title={displayName}>
              {truncatedName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              aria-label="Logout"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* ═══════════════ Main Content Area ═══════════════ */}
      <div className="flex-1 flex flex-col lg:ml-64">
        {/* ═══════════════ Top Header (all sizes) ═══════════════ */}
        <header className="sticky top-0 z-40 bg-gray-800 border-b border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Hamburger (tablet/mobile) + Title */}
            <div className="flex items-center gap-3">
              {/* Hamburger button - visible below lg */}
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
              >
                {menuOpen ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>

              <div>
                <h1 className="text-base font-semibold lg:text-lg">{pageTitle}</h1>
                {breadcrumb && (
                  <nav aria-label="Breadcrumb" className="text-sm text-gray-400">
                    <NavLink to={breadcrumb.parentPath} className="hover:text-white">
                      {breadcrumb.parent}
                    </NavLink>
                    <span className="mx-1">›</span>
                    <span>{breadcrumb.label}</span>
                  </nav>
                )}
              </div>
            </div>

            {/* Right: User info + logout (visible on tablet/mobile header) */}
            <div className="flex items-center gap-2 lg:hidden">
              <span className="hidden md:inline text-sm text-gray-300 truncate max-w-[150px]" title={displayName}>
                {truncatedName}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                aria-label="Logout"
              >
                🚪
              </button>
            </div>
          </div>
        </header>

        {/* ═══════════════ Hamburger Menu Overlay (below lg) ═══════════════ */}
        {menuOpen && (
          <>
            {/* Backdrop */}
            <div
              className="lg:hidden fixed inset-0 z-30 bg-black/50"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            {/* Slide-down menu */}
            <nav
              className="lg:hidden fixed top-[61px] left-0 right-0 z-40 bg-gray-800 border-b border-gray-700 shadow-lg max-h-[70vh] overflow-y-auto px-3 py-4 space-y-1"
              aria-label="Mobile navigation"
            >
              {/* On mobile (<768px): only secondary items shown (primaries are in bottom nav) */}
              {/* On tablet (≥768px): all items shown in hamburger menu */}
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `items-center gap-3 px-4 py-3 rounded-lg text-base min-h-[44px] min-w-[44px] transition-colors ${
                      item.primary ? 'hidden md:flex' : 'flex'
                    } ${
                      isActive
                        ? 'bg-primary/20 text-primary font-semibold'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    }`
                  }
                  onClick={handleNavClick}
                >
                  <span className="text-lg" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </>
        )}

        {/* ═══════════════ Page Content ═══════════════ */}
        <main className="flex-1 p-4 pb-20 md:pb-4 text-sm md:text-base">
          {children}
        </main>
      </div>

      {/* ═══════════════ Bottom Navigation Bar (mobile <768px) ═══════════════ */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-gray-800 border-t border-gray-700 flex items-center justify-around px-2 py-1"
        aria-label="Bottom navigation"
      >
        {NAV_ITEMS.filter((item) => item.primary).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-2 py-1 rounded-lg text-xs transition-colors ${
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-gray-400 hover:text-white'
              }`
            }
          >
            <span className="text-lg" aria-hidden="true">{item.icon}</span>
            <span className="mt-0.5 leading-tight">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
