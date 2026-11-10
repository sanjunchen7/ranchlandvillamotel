import { useState } from "react";
import { useNavigate } from "react-router";
import { CalendarDays, Users } from "lucide-react";

function plusDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}

export function AvailabilityWidget({ today, compact = false }: { today: string; compact?: boolean }) {
  const navigate = useNavigate();
  const [checkIn, setCheckIn] = useState(plusDays(today, 7));
  const [checkOut, setCheckOut] = useState(plusDays(today, 9));
  const [adults, setAdults] = useState(2);
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (checkIn < today) return setError("Check-in cannot be in the past.");
    if (checkOut <= checkIn) return setError("Check-out must be after check-in.");
    navigate(`/availability?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&children=0`);
  };
  return <form onSubmit={submit} className={`grid gap-4 ${compact ? "md:grid-cols-[1fr_1fr_0.7fr_auto]" : "sm:grid-cols-2"}`} aria-label="Check room availability">
    <label><span className="field-label flex items-center gap-1.5"><CalendarDays size={16} />Check-in</span><input className="field" type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required /></label>
    <label><span className="field-label flex items-center gap-1.5"><CalendarDays size={16} />Check-out</span><input className="field" type="date" min={plusDays(checkIn, 1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required /></label>
    <label><span className="field-label flex items-center gap-1.5"><Users size={16} />Guests (age 2+)</span><select className="field" value={adults} onChange={(e) => setAdults(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? "guest" : "guests"}</option>)}</select></label>
    <button className="btn-primary self-end sm:col-span-2 md:col-span-1" type="submit">Check Availability</button>
    {error && <p role="alert" className="text-sm font-semibold text-red-700 sm:col-span-2 md:col-span-4">{error}</p>}
  </form>;
}
