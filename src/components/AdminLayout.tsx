import { useEffect, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { BedDouble, CalendarDays, CalendarRange, Image, LayoutDashboard, LogOut, Settings, TableProperties } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { clearStaffToken } from "@/lib/staff-session";

const links = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/reservations", label: "Reservations", icon: CalendarDays },
  { to: "/admin/rooms", label: "Rooms", icon: BedDouble },
  { to: "/admin/rates", label: "Daily Rates", icon: TableProperties },
  { to: "/admin/availability", label: "Availability", icon: CalendarRange },
  { to: "/admin/media", label: "Media Library", icon: Image },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminLayout({ children, title }: { children: ReactNode; title: string }) {
  const auth = trpc.auth.me.useQuery();
  const navigate = useNavigate(); const location = useLocation();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { clearStaffToken(); navigate("/admin/login"); } });
  useEffect(() => { if (!auth.isLoading && !auth.data) { clearStaffToken(); navigate("/admin/login", { replace: true, state: { from: location.pathname } }); } }, [auth.isLoading, auth.data, navigate, location.pathname]);
  if (auth.isLoading || !auth.data) return <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-slate-600">Loading staff workspace…</div>;
  return <div className="min-h-dvh bg-slate-100 text-slate-900 lg:grid lg:grid-cols-[240px_1fr]">
    <aside className="bg-[var(--rv-navy-deep)] text-slate-100 lg:min-h-dvh">
      <div className="flex items-center justify-between gap-3 p-5 lg:block"><Link to="/" className="font-serif text-xl font-bold">Ranchland Villa</Link><span className="text-xs text-slate-400 lg:mt-1 lg:block">RESERVATION MANAGEMENT</span></div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-3" aria-label="Admin navigation">{links.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `flex min-h-11 shrink-0 items-center gap-2 rounded px-3 text-sm font-medium ${isActive ? "bg-[var(--rv-navy)] text-white" : "text-slate-300 hover:bg-[var(--rv-navy)]"}`}><item.icon size={17} />{item.label}</NavLink>)}</nav>
      <div className="hidden border-t border-slate-700 p-5 lg:block"><p className="text-sm font-semibold">{auth.data.name}</p><p className="text-xs text-slate-400">{auth.data.role}</p><button onClick={() => logout.mutate()} className="mt-4 flex min-h-10 items-center gap-2 text-sm text-slate-300 hover:text-white"><LogOut size={16} />Sign out</button></div>
    </aside>
    <div className="min-w-0"><header className="flex min-h-16 items-center justify-between border-b bg-white px-5 md:px-8"><h1 className="text-xl font-bold">{title}</h1><div className="flex items-center gap-3"><Link to="/" className="hidden min-h-10 items-center text-sm font-semibold text-blue-800 hover:underline sm:flex">View public site</Link><button onClick={() => logout.mutate()} className="admin-btn border lg:hidden" aria-label="Sign out"><LogOut size={16} /></button></div></header><main className="p-5 md:p-8">{children}</main></div>
  </div>;
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = { REQUESTED: "bg-blue-100 text-blue-800", REVIEWING: "bg-indigo-100 text-indigo-800", AWAITING_GUARANTEE: "bg-amber-100 text-amber-900", CARD_GUARANTEED: "bg-purple-100 text-purple-800", CONFIRMED: "bg-emerald-100 text-emerald-800", CHECKED_IN: "bg-teal-100 text-teal-800", CHECKED_OUT: "bg-slate-200 text-slate-700", DECLINED: "bg-red-100 text-red-800", CANCELLED: "bg-red-100 text-red-800", NO_SHOW: "bg-orange-100 text-orange-800" };
  return <span className={`status-pill ${styles[status] || "bg-slate-200"}`}>{status.replaceAll("_", " ")}</span>;
}
