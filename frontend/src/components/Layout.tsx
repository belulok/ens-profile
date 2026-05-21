import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";

export default function Layout() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={clsx(
          "border-b transition-colors",
          isHome
            ? "border-transparent backdrop-blur-sm bg-zinc-950/30"
            : "border-zinc-800 bg-zinc-950",
          "relative z-20",
        )}
      >
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="font-semibold text-lg tracking-tight">
            ens<span className="text-zinc-500">.</span>profiles
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <NavItem to="/">Home</NavItem>
            <NavItem to="/graph">Graph</NavItem>
          </nav>
        </div>
      </header>
      <main className="flex-1 relative">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        clsx(
          "px-3 py-1.5 rounded-md transition-colors",
          isActive
            ? "text-white"
            : "text-zinc-400 hover:text-white hover:bg-zinc-900",
        )
      }
    >
      {children}
    </NavLink>
  );
}
