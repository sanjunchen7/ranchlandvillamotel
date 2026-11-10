import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { AdminLayout } from "@/components/AdminLayout";

function datePlus(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
const cellStyles: Record<string, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-900", HELD: "bg-amber-100 text-amber-900",
  CONFIRMED: "bg-blue-100 text-blue-900", CHECKED_IN: "bg-teal-100 text-teal-900", MAINTENANCE: "bg-slate-300 text-slate-800",
};

export default function AdminAvailability() {
  const [startDate, setStartDate] = useState(datePlus(0)); const [endDate, setEndDate] = useState(datePlus(6));
  const [range, setRange] = useState({ startDate, endDate });
  const calendar = trpc.manage.availabilityCalendar.useQuery(range);
  return <AdminLayout title="Availability Calendar">
    <form className="mb-5 flex flex-col gap-3 bg-white p-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setRange({ startDate, endDate }); }}>
      <input className="admin-field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Calendar start date" />
      <input className="admin-field" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="Calendar end date" />
      <button className="admin-btn bg-slate-900 text-white">View up to 14 days</button>
    </form>
    <div className="mb-4 flex flex-wrap gap-3 text-xs">{Object.entries(cellStyles).map(([status, style]) => <span key={status} className={`rounded px-2 py-1 font-bold ${style}`}>{status.replace("_", " ")}</span>)}</div>
    <div className="overflow-x-auto bg-white"><table className="border-collapse text-center text-xs"><thead><tr className="bg-slate-50"><th className="sticky left-0 z-10 min-w-28 border bg-slate-50 p-3 text-left">Room</th>{calendar.data?.dates.map((date) => <th key={date} className="min-w-36 border p-3">{date}<span className="block text-[10px] font-normal text-slate-400">{new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span></th>)}</tr></thead><tbody>{calendar.data?.rooms.map((room) => <tr key={room.id}><th className="sticky left-0 z-10 border bg-white p-3 text-left text-sm">Room {room.roomNumber}</th>{room.cells.map((cell) => <td key={cell.date} className={`border p-2 align-top ${cellStyles[cell.status]}`}><strong>{cell.status.replace("_", " ")}</strong><span className="mt-1 block">CA${cell.rate}</span>{cell.reservationId ? <Link to={`/admin/reservations/${cell.reservationId}`} className="mt-1 block font-bold underline" title={`${cell.requestNumber} · ${cell.guest}`}>{cell.requestNumber}<span className="block font-normal">{cell.guest}</span></Link> : <span className="mt-1 block text-[10px]">Open</span>}</td>)}</tr>)}</tbody></table></div>
    {calendar.isLoading && <p className="mt-4">Loading room nights…</p>}
  </AdminLayout>;
}
