import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { AdminLayout } from "@/components/AdminLayout";
import { notifyPublicDataChanged } from "@/lib/data-sync";

function datePlus(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

export default function AdminRates() {
  const [startDate, setStartDate] = useState(datePlus(0)); const [endDate, setEndDate] = useState(datePlus(6));
  const [range, setRange] = useState({ startDate, endDate });
  const rates = trpc.manage.rates.useQuery(range);
  const [selected, setSelected] = useState<Set<number>>(new Set()); const [rate, setRate] = useState("119.00"); const [weekends, setWeekends] = useState(false); const [message, setMessage] = useState("");
  const save = trpc.manage.batchRates.useMutation({ onSuccess: async (result) => { notifyPublicDataChanged(); setMessage(`${result.updated} nightly rates updated.`); await rates.refetch(); }, onError: (e) => setMessage(e.message) });
  const toggle = (id: number) => setSelected((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <AdminLayout title="Daily Rate Calendar">
    <form className="mb-5 flex flex-col gap-3 bg-white p-4 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setRange({ startDate, endDate }); }}><input className="admin-field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /><input className="admin-field" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /><button className="admin-btn bg-slate-900 text-white">View rates</button></form>
    {message && <p className="mb-5 border-l-4 border-blue-700 bg-blue-50 p-4 text-blue-900">{message}</p>}
    <section className="mb-6 bg-white p-5"><h2 className="font-bold">Batch update</h2><p className="mt-1 text-sm text-slate-600">Select rooms below, then apply one rate to the displayed date range. Weekend-only applies Friday and Saturday nights. This changes actual quote calculations, not the manually maintained homepage From Price (Settings → Public website settings).</p><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><input className="admin-field sm:w-44" value={rate} onChange={(e) => setRate(e.target.value)} aria-label="Nightly rate" /><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={weekends} onChange={(e) => setWeekends(e.target.checked)} />Friday & Saturday only</label><button disabled={!selected.size || save.isPending} className="admin-btn bg-blue-800 text-white" onClick={() => save.mutate({ roomIds: [...selected], startDate: range.startDate, endDate: range.endDate, rate, weekdays: weekends ? [5, 6] : undefined })}>Apply to {selected.size} room(s)</button><button className="admin-btn border" onClick={() => setSelected(new Set(rates.data?.rooms.map((r) => r.id) || []))}>Select all</button></div></section>
    <div className="overflow-x-auto bg-white"><table className="border-collapse text-center text-xs"><thead><tr className="bg-slate-50"><th className="sticky left-0 z-10 min-w-32 border bg-slate-50 p-3 text-left">Room</th>{rates.data?.dates.map((date) => <th key={date} className="min-w-28 border p-3">{date.slice(5)}<span className="block text-[10px] text-slate-400">{new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { weekday: "short", timeZone: "UTC" })}</span></th>)}</tr></thead><tbody>{rates.data?.rooms.map((room) => <tr key={room.id}><th className="sticky left-0 z-10 border bg-white p-3 text-left"><label className="flex items-center gap-2"><input type="checkbox" checked={selected.has(room.id)} onChange={() => toggle(room.id)} />Room {room.roomNumber}</label></th>{rates.data?.dates.map((date) => { const value = rates.data.rates.find((r) => r.roomId === room.id && r.rateDate === date)?.rate ?? room.defaultRate; return <td key={date} className="border p-3 font-semibold">CA${value}</td>; })}</tr>)}</tbody></table></div>
  </AdminLayout>;
}
