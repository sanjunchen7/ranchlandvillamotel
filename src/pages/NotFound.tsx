import { Link } from "react-router";
import { PublicLayout, usePageTitle } from "@/components/PublicLayout";

export default function NotFound() {
  usePageTitle("Page Not Found");
  return <PublicLayout><section className="section-shell py-24"><p className="eyebrow text-[var(--rv-navy)]">404</p><h1 className="display-title mt-4">This page took a wrong turn.</h1><p className="mt-5 max-w-xl text-lg text-[var(--rv-muted)]">The page you requested does not exist. Return home or check room availability for your stay in Merritt.</p><div className="mt-8 flex gap-3"><Link to="/" className="btn-secondary">Return Home</Link><Link to="/availability" className="btn-primary">Check Availability</Link></div></section></PublicLayout>;
}
