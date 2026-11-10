import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Search } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AdminLayout, StatusBadge } from "@/components/AdminLayout";
import { RESERVATION_STATUSES } from "@contracts/business";

export default function AdminReservations() {
  const [params, setParams] = useSearchParams();
  const initialStatus = params.get("status") || "";
  const [search, setSearch] = useState(""); const [status, setStatus] = useState(initialStatus);
  const [applied, setApplied] = useState({ search: "", status: initialStatus });
  const list = trpc.reservations.list.useQuery({ search: applied.search || undefined, status: (applied.status || undefined) as (typeof RESERVATION_STATUSES)[number] | undefined });
  const apply = (e: React.FormEvent) => { e.preventDefault(); setApplied({ search, status }); setParams(status ? { status } : {}); };
  return <AdminLayout title="Reservations">
    <div className="mb-4 flex justify-end"><Link to="/admin/walk-in" className="admin-btn bg-emerald-700 text-white">Add Walk-in Reservation</Link></div>
    <form onSubmit={apply} className="mb-5 flex flex-col gap-3 bg-white p-4 sm:flex-row"><label className="relative flex-1"><span className="sr-only">Search reservations</span><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className="admin-field pl-10" placeholder="Reservation #, name, phone or email" value={search} onChange={(e) => setSearch(e.target.value)} /></label><select className="admin-field sm:w-56" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="">All statuses</option>{RESERVATION_STATUSES.map((s) => <option key={s}>{s}</option>)}</select><button className="admin-btn bg-slate-900 text-white">Apply filters</button></form>
    <div className="bg-white"><div className="overflow-x-auto"><table className="w-full min-w-full md:min-w-[960px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Request / Guest</th><th className="p-4">Dates</th><th className="p-4">Room</th><th className="p-4">Preferences</th><th className="p-4">Estimate</th><th className="p-4">Status</th><th className="p-4"></th></tr></thead><tbody>{list.data?.map((row) => <tr key={row.reservation.id} className="border-t hover:bg-slate-50"><td className="p-4"><Link to={`/admin/reservations/${row.reservation.id}`} className="font-bold text-blue-800 hover:underline">{row.reservation.requestNumber}</Link><p className="mt-1">{row.reservation.firstName} {row.reservation.lastName}</p><p className="text-xs text-slate-500">{row.reservation.phone}</p></td><td className="p-4">{row.reservation.checkIn}<br />→ {row.reservation.checkOut}</td><td className="p-4">{row.roomType}<p className="mt-1 text-xs text-slate-500">{row.roomNumber ? `Assigned Room ${row.roomNumber}` : "Not assigned"}</p></td><td className="p-4 text-xs">{row.reservation.kitchenPreference}{row.reservation.pets && <span className="ml-1 rounded bg-amber-100 px-2 py-1 font-bold text-amber-900">PETS</span>}{row.reservation.earlyCheckInStatus === "REQUESTED" && <span className="ml-1 rounded bg-blue-100 px-2 py-1 font-bold text-blue-800">EARLY</span>}</td><td className="p-4">CA${row.reservation.estimatedTotal}</td><td className="p-4"><StatusBadge status={row.reservation.status} /></td><td className="p-4"><Link className="font-bold text-blue-800 underline" to={`/admin/reservations/${row.reservation.id}`}>Manage</Link></td></tr>)}</tbody></table></div>{list.data?.length === 0 && <p className="p-10 text-center text-slate-500">No reservations match these filters.</p>}</div>
  </AdminLayout>;
}
