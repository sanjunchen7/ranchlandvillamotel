import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { CalendarDays, Mail, MapPin, Menu, MessageSquareText, Phone, X } from "lucide-react";
import { MOTEL } from "@contracts/business";

const nav = [
  { to: "/", label: "Home" }, { to: "/rooms", label: "Rooms" },
  { to: "/availability", label: "Availability" }, { to: "/contact", label: "Contact" }, { to: "/faq", label: "FAQ" },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [location.pathname]);
  return <div className="min-h-dvh pb-[76px] md:pb-0">
    <a href="#main-content" className="absolute left-3 top-3 z-50 -translate-y-24 bg-white px-4 py-2 font-bold text-slate-900 focus:translate-y-0">Skip to content</a>
    <div className="navy-panel text-sm">
      <div className="section-shell flex min-h-11 items-center justify-between gap-3 py-2">
        <span className="hidden sm:inline">24-hour front desk · Ground-floor rooms</span>
        <span className="sm:hidden">24-hour front desk</span>
        <div className="flex items-center gap-4">
          <a className="flex min-h-8 items-center gap-1.5 font-semibold hover:underline" href={MOTEL.phoneHref}><Phone size={15} />Call</a>
          <a className="flex min-h-8 items-center gap-1.5 font-semibold hover:underline" href={MOTEL.textHref}><MessageSquareText size={15} />Text</a>
          <Link className="hidden min-h-8 items-center gap-1.5 font-semibold hover:underline sm:flex" to="/availability"><CalendarDays size={15} />Check Availability</Link>
        </div>
      </div>
    </div>
    <header className="sticky top-0 z-30 border-b bg-[var(--rv-paper)]/95 backdrop-blur-sm">
      <div className="section-shell flex min-h-[78px] items-center justify-between gap-4">
        <Link to="/" className="group flex items-center gap-3" aria-label="Ranchland Villa Motel home">
          <img src="/icons/icon.svg" alt="" className="h-11 w-11" />
          <span><span className="display-font block text-xl font-bold leading-none text-[var(--rv-navy)]">Ranchland Villa</span><span className="eyebrow mt-1 block text-[var(--rv-muted)]">Motel · Merritt, BC</span></span>
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main navigation">
          {nav.map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `min-h-11 py-2 text-sm font-semibold hover:text-[var(--rv-navy)] hover:underline ${isActive ? "text-[var(--rv-navy)] underline underline-offset-8" : "text-slate-600"}`}>{item.label}</NavLink>)}
          <Link to="/availability" className="btn-primary">Request Reservation</Link>
        </nav>
        <button className="inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close menu" : "Open menu"}>{open ? <X /> : <Menu />}</button>
      </div>
      {open && <nav id="mobile-menu" className="border-t bg-[var(--rv-paper)] px-5 py-4 lg:hidden" aria-label="Mobile navigation">
        {nav.map((item) => <NavLink key={item.to} to={item.to} className="flex min-h-12 items-center border-b font-semibold text-[var(--rv-navy)]">{item.label}</NavLink>)}
        <Link to="/availability" className="btn-primary mt-4 w-full">Request Reservation</Link>
      </nav>}
    </header>
    <main id="main-content">{children}</main>
    <footer className="mt-20 bg-[var(--rv-navy-deep)] text-[var(--rv-cream)]">
      <div className="section-shell grid gap-10 py-12 md:grid-cols-12">
        <div className="md:col-span-5"><h2 className="display-font text-3xl font-bold">Ranchland Villa Motel</h2><p className="mt-3 max-w-md text-[var(--rv-cream)]">Clean, comfortable and practical ground-floor rooms for road trips, families and longer stays in Merritt.</p></div>
        <div className="md:col-span-3"><h3 className="eyebrow text-[var(--rv-yellow)]">Find your way</h3><div className="mt-4 flex flex-col gap-2">{nav.map((item) => <Link className="min-h-8 hover:underline" key={item.to} to={item.to}>{item.label}</Link>)}</div></div>
        <div className="md:col-span-4"><h3 className="eyebrow text-[var(--rv-yellow)]">Contact the front desk</h3><address className="mt-4 flex flex-col gap-3 not-italic"><a className="flex items-start gap-2 hover:underline" href="https://www.google.com/maps/search/?api=1&query=2379+Nicola+Ave+Merritt+BC+Canada" target="_blank" rel="noreferrer"><MapPin size={18} className="mt-1 shrink-0" />{MOTEL.address}</a><a className="flex items-center gap-2 hover:underline" href={MOTEL.phoneHref}><Phone size={18} />{MOTEL.phone}</a><a className="flex items-center gap-2 hover:underline" href={`mailto:${MOTEL.email}`}><Mail size={18} />{MOTEL.email}</a></address></div>
      </div>
      <div className="border-t border-white/20"><div className="section-shell flex flex-col gap-2 py-5 text-sm sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Ranchland Villa Motel</span><Link to="/admin/login" className="min-h-8 hover:underline">Staff sign in</Link></div></div>
    </footer>
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t bg-[var(--rv-paper)] pb-[env(safe-area-inset-bottom)] md:hidden">
      <a href={MOTEL.phoneHref} className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 text-xs font-bold text-[var(--rv-navy)]"><Phone size={20} />Call</a>
      <a href={MOTEL.textHref} className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 border-x text-xs font-bold text-[var(--rv-navy)]"><MessageSquareText size={20} />Text</a>
      <Link to="/availability" className="flex min-h-[64px] flex-col items-center justify-center gap-0.5 bg-[var(--rv-yellow)] text-xs font-bold text-[var(--rv-navy)]"><CalendarDays size={20} />Availability</Link>
    </div>
  </div>;
}

export function usePageTitle(title: string) {
  useEffect(() => { document.title = `${title} | Ranchland Villa Motel, Merritt BC`; }, [title]);
}
