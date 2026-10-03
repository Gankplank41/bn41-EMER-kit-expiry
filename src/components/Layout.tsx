import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "ภาพรวม", end: true },
  { to: "/import", label: "นำเข้าจาก Excel" },
  { to: "/settings", label: "ตั้งค่าแจ้งเตือน" },
];

export default function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-kit-bg">
      <header className="border-b border-kit-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-display text-base font-semibold text-kit-crimson-dark">
              BN41 แจ้งเตือนยากล่องฉุกเฉิน
            </h1>
            {user?.email && <p className="text-xs text-kit-muted">{user.email}</p>}
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-kit-border px-3 py-1.5 text-xs font-medium text-kit-muted transition hover:bg-kit-bg"
          >
            ออกจากระบบ
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-kit-crimson-light text-kit-crimson-dark"
                    : "text-kit-muted hover:bg-kit-bg"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
