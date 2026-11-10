import { Link } from "react-router";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AdminLayout, StatusBadge } from "@/components/AdminLayout";

export default function AdminDashboard() {
  const dashboard = trpc.reservations.dashboard.useQuery();
  const recent = trpc.reservations.list.useQuery({});
  const data = dashboard.data;
  const cards = data ? [
    ["Arrivals today", data.arrivals], ["Departures today", data.departures], ["In-house", data.inHouse],
    ["New requests", data.requests], ["Awaiting guarantee", data.awaitingGuarantee], ["Confirmed", data.confirmed],
    ["Available rooms", data.available], ["Occupied", data.occupied], ["Out of service", data.outOfService],
  ] : [];
  return <AdminLayout title="Today at Ranchland Villa">
    {data?.pendingEmails ? <div className="mb-6 flex items-center gap-3 border-l-4 border-amber-500 bg-amber-50 p-4 text-amber-900"><AlertTriangle /><span>{data.pendingEmails} email(s) need attention. Reservation statuses are not affected.</span><Link to="/admin/settings#emails" className="font-bold underline">Open outbox</Link></div> : null}
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">{cards.map(([label, value]) => <div key={label} className="border-t-4 border-slate-700 bg-white p-5"><p className="text-3xl font-bold">{value}</p><p className="mt-1 text-sm text-slate-600">{label}</p></div>)}</div>
    <section className="mt-8 bg-white"><div className="flex items-center justify-between border-b p-5"><h2 className="text-lg font-bold">Latest reservation requests</h2><Link to="/admin/reservations" className="flex min-h-10 items-center gap-2 text-sm font-bold text-blue-800">View all<ArrowRight size={16} /></Link></div>
      <div className="overflow-x-auto"><table className="w-full min-w-full md:min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Request</th><th className="p-4">Guest</th><th className="p-4">Dates</th><th className="p-4">Room type</th><th className="p-4">Status</th><th className="p-4"></th></tr></thead><tbody>{recent.data?.slice(0, 8).map((row) => <tr key={row.reservation.id} className="border-t"><td className="p-4 font-semibold">{row.reservation.requestNumber}</td><td className="p-4">{row.reservation.firstName} {row.reservation.lastName}</td><td className="p-4">{row.reservation.checkIn} → {row.reservation.checkOut}</td><td className="p-4">{row.roomType}</td><td className="p-4"><StatusBadge status={row.reservation.status} /></td><td className="p-4"><Link to={`/admin/reservations/${row.reservation.id}`} className="font-bold text-blue-800 underline">Open</Link></td></tr>)}</tbody></table></div>
      {recent.data?.length === 0 && <p className="p-8 text-center text-slate-500">No reservation requests yet.</p>}
    </section>
  </AdminLayout>;
}
