import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronLeft, LoaderCircle, Phone } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PublicLayout, usePageTitle } from "@/components/PublicLayout";
import { MOTEL } from "@contracts/business";

function plusDays(date: string, days: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
const times = Array.from({ length: 12 }, (_, i) => { const hour = i + 12; const display = hour > 12 ? hour - 12 : hour; return `${display}:00 ${hour >= 12 ? "PM" : "AM"}`; });

export default function Availability() {
  usePageTitle("Check Availability & Request a Reservation");
  const bootstrap = trpc.public.bootstrap.useQuery();
  const [params, setParams] = useSearchParams();
  const today = bootstrap.data?.today || new Date().toISOString().slice(0, 10);
  const [checkIn, setCheckIn] = useState(params.get("checkIn") || plusDays(today, 7));
  const [checkOut, setCheckOut] = useState(params.get("checkOut") || plusDays(today, 9));
  const [adults, setAdults] = useState(Number(params.get("adults") || 2));
  const [children, setChildren] = useState(Number(params.get("children") || 0));
  const [infants, setInfants] = useState(0);
  const [kitchenPreference, setKitchenPreference] = useState<"NO_PREFERENCE" | "PREFER" | "REQUIRED">("NO_PREFERENCE");
  const [queryInput, setQueryInput] = useState({ checkIn, checkOut, adults, children, infants, preferredCheckInTime: "2:00 PM", kitchenPreference });
  const [selectedId, setSelectedId] = useState<number | null>(Number(params.get("roomTypeId")) || null);
  const [preferredTime, setPreferredTime] = useState("2:00 PM");
  const [arrivalTime, setArrivalTime] = useState("");
  const [pets, setPets] = useState(false);
  const [vehicleType, setVehicleType] = useState<"Car" | "SUV" | "Pickup" | "Other">("Car");
  const [firstName, setFirstName] = useState(""); const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [specialRequests, setSpecialRequests] = useState(""); const [website, setWebsite] = useState("");
  const [formError, setFormError] = useState(""); const [success, setSuccess] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const availability = trpc.public.availability.useQuery(queryInput, { retry: false });
  const submit = trpc.public.submitRequest.useMutation({
    onSuccess: (result) => { setSuccess(result.requestNumber); setFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); },
    onError: (error) => setFormError(error.message),
  });
  const selected = useMemo(() => availability.data?.results.find((r) => r.roomType.id === selectedId && r.level !== "UNAVAILABLE"), [availability.data, selectedId]);
  useEffect(() => { if (selected) document.getElementById("reservation-form")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [selectedId]);

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault(); setSuccess(null); setSelectedId(null);
    const input = { checkIn, checkOut, adults, children, infants, preferredCheckInTime: "2:00 PM", kitchenPreference };
    setQueryInput(input); setParams({ checkIn, checkOut, adults: String(adults), children: String(children) });
  };
  const submitRequest = (e: React.FormEvent) => {
    e.preventDefault(); setFormError("");
    if (!selected) return setFormError("Please select an available room type first.");
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim()) return setFormError("Please complete all required guest information.");
    submit.mutate({
      checkIn: queryInput.checkIn, checkOut: queryInput.checkOut, adults: queryInput.adults, children: queryInput.children, infants: queryInput.infants,
      roomTypeId: selected.roomType.id, kitchenPreference, preferredCheckInTime: preferredTime, estimatedArrivalTime: arrivalTime || undefined,
      pets, firstName, lastName, phone, email, vehicleType, specialRequests: specialRequests || undefined,
      idempotencyKey: idempotencyKey.current, website,
    });
  };

  if (success) return <PublicLayout><section className="section-shell py-16 md:py-24"><div className="mx-auto max-w-3xl border-t-4 border-[var(--rv-navy)] bg-[var(--rv-cream)] p-7 md:p-12"><CheckCircle2 size={44} className="text-[var(--rv-navy)]" /><p className="eyebrow mt-6 text-[var(--rv-navy)]">Reservation Request Received</p><h1 className="display-title mt-3">Thank you for choosing Ranchland Villa Motel.</h1><div className="mt-6 border-y py-5"><span className="text-sm font-semibold">Reservation Request Number</span><strong className="mt-1 block text-2xl text-[var(--rv-navy)]">{success}</strong></div><p className="mt-6">Your reservation request has been received and is being reviewed by our front desk. <strong>Your reservation is not confirmed yet.</strong></p><p className="mt-3">We may contact you to obtain a valid credit card to guarantee your reservation. Once your reservation is confirmed, you will receive a confirmation email.</p><div className="mt-8 flex flex-wrap gap-3"><Link to="/" className="btn-secondary">Return Home</Link><a href={MOTEL.phoneHref} className="btn-primary"><Phone size={17} />Call the Front Desk</a></div></div></section></PublicLayout>;

  return <PublicLayout>
    <section className="navy-panel py-12 md:py-16"><div className="section-shell"><p className="eyebrow text-[var(--rv-charcoal)]">Availability & reservation request</p><h1 className="display-title mt-3">Find your room in Merritt.</h1><p className="mt-4 max-w-2xl text-lg">Choose your dates, review the estimate, then send a request to our front desk.</p></div></section>
    <section className="section-shell py-8"><form onSubmit={runSearch} className="paper-panel grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-6 lg:items-end" aria-label="Availability dates and guests">
      <label><span className="field-label">Check-in</span><input className="field" type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required /></label>
      <label><span className="field-label">Check-out</span><input className="field" type="date" min={plusDays(checkIn, 1)} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required /></label>
      <label><span className="field-label">Adults</span><select className="field" value={adults} onChange={(e) => setAdults(Number(e.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
      <label><span className="field-label">Children age 2+</span><select className="field" value={children} onChange={(e) => setChildren(Number(e.target.value))}>{[0, 1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label>
      <label><span className="field-label">Infants under 2</span><select className="field" value={infants} onChange={(e) => setInfants(Number(e.target.value))}>{[0, 1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
      <button className="btn-primary" type="submit">Update Search</button>
      <label className="sm:col-span-2 lg:col-span-3"><span className="field-label">Kitchen preference</span><select className="field" value={kitchenPreference} onChange={(e) => setKitchenPreference(e.target.value as typeof kitchenPreference)}><option value="NO_PREFERENCE">No preference</option><option value="PREFER">Prefer a kitchen</option><option value="REQUIRED">Kitchen required</option></select></label>
      <p className="text-sm text-[var(--rv-muted)] sm:col-span-2 lg:col-span-3">Infants under 2 do not count toward maximum occupancy. Kitchen availability is subject to confirmation by the motel.</p>
    </form></section>

    <section className="section-shell py-8" aria-live="polite"><div className="flex items-end justify-between gap-4"><h2 className="section-title">Room types for your stay</h2><span className="hidden text-sm text-[var(--rv-muted)] sm:block">{queryInput.checkIn} → {queryInput.checkOut}</span></div>
      {availability.isLoading && <p className="mt-10 flex items-center gap-2"><LoaderCircle className="animate-spin" />Checking availability…</p>}
      {availability.error && <div role="alert" className="mt-8 border-l-4 border-red-700 bg-red-50 p-5 text-red-900">{availability.error.message}</div>}
      {availability.data && <><p className="mt-3 text-sm text-[var(--rv-muted)]">{availability.data.notice}</p><div className="mt-8 flex flex-col gap-6">{availability.data.results.map((result) => <article key={result.roomType.id} className={`grid border-2 bg-[var(--rv-paper)] md:grid-cols-12 ${selectedId === result.roomType.id ? "border-[var(--rv-navy)]" : "border-[var(--rv-line)]"}`}>
        <img src={result.photo} alt={`${result.roomType.name} at Ranchland Villa Motel`} className="aspect-[16/9] h-full w-full object-cover md:col-span-3" />
        <div className="p-5 md:col-span-6"><div className="flex flex-wrap items-center gap-3"><h3 className="display-font text-2xl font-bold">{result.roomType.name}</h3><span className={`status-pill ${result.level === "AVAILABLE" ? "bg-emerald-100 text-emerald-900" : result.level === "LIMITED" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700"}`}>{result.level === "AVAILABLE" ? "Available to request" : result.level === "LIMITED" ? "Limited availability" : "Unavailable"}</span></div><p className="mt-2 text-sm">{result.roomType.bedDescription} · Up to {result.roomType.maxOccupancy} guests · {result.roomType.kitchenCopy}</p><p className="mt-2 text-sm text-[var(--rv-muted)]">{result.reason}</p>{result.quote && <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm"><span>Subtotal <strong>CA${result.quote.subtotal}</strong></span><span>Taxes <strong>CA${result.quote.taxes}</strong></span><span>Estimated Total <strong className="text-lg text-[var(--rv-navy)]">CA${result.quote.total}</strong></span></div>}</div>
        <div className="flex items-center p-5 pt-0 md:col-span-3 md:items-end md:justify-end md:pt-5"><button disabled={result.level === "UNAVAILABLE"} className="btn-primary w-full" onClick={() => { setSelectedId(result.roomType.id); setSuccess(null); }}>{selectedId === result.roomType.id ? "Selected" : "Request This Room Type"}<ArrowRight size={17} /></button></div>
      </article>)}</div></>}
    </section>

    {selected && <section id="reservation-form" className="scroll-mt-24 bg-[var(--rv-cream)] py-14"><div className="section-shell grid gap-10 lg:grid-cols-12">
      <aside className="lg:col-span-4"><button className="mb-5 flex min-h-11 items-center gap-2 font-semibold text-[var(--rv-navy)]" onClick={() => setSelectedId(null)}><ChevronLeft size={18} />Choose another room type</button><h2 className="display-font text-4xl font-bold">Your request</h2><div className="mt-6 border-y py-5"><strong>{selected.roomType.name}</strong><p className="mt-2">{queryInput.checkIn} → {queryInput.checkOut}</p><p>{queryInput.adults} adults · {queryInput.children} children age 2+ · {queryInput.infants} infants</p></div>{selected.quote && <dl className="mt-5 flex flex-col gap-2"><div className="flex justify-between"><dt>Subtotal</dt><dd>CA${selected.quote.subtotal}</dd></div><div className="flex justify-between"><dt>Taxes</dt><dd>CA${selected.quote.taxes}</dd></div><div className="flex justify-between border-t pt-3 text-xl font-bold"><dt>Estimated Total</dt><dd>CA${selected.quote.total}</dd></div></dl>}<p className="mt-4 text-sm text-[var(--rv-muted)]">This is an estimate. Your final price is saved when the front desk confirms the reservation.</p></aside>
      <form onSubmit={submitRequest} className="bg-[var(--rv-paper)] p-5 md:p-8 lg:col-span-8" noValidate={false}>
        <h3 className="display-font text-3xl font-bold">Guest information</h3><div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label><span className="field-label">First Name *</span><input className="field" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={100} /></label>
          <label><span className="field-label">Last Name *</span><input className="field" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required maxLength={100} /></label>
          <label><span className="field-label">Mobile Phone *</span><input className="field" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={50} /></label>
          <label><span className="field-label">Email *</span><input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={320} /></label>
          <label><span className="field-label">Preferred Check-in Time</span><select className="field" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)}>{times.map((time) => <option key={time}>{time}</option>)}</select></label>
          <label><span className="field-label">Estimated Arrival Time (optional)</span><input className="field" placeholder="e.g. Around 10:30 PM" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} maxLength={20} /></label>
        </div>{preferredTime !== "2:00 PM" && ["12:00 PM", "1:00 PM"].includes(preferredTime) && <p className="mt-4 border-l-4 border-[var(--rv-yellow)] bg-[var(--rv-cream)] p-3 text-sm">Early check-in from 12:00 PM may be available by arrangement. The motel will confirm whether your requested arrival time can be accommodated.</p>}
        <div className="mt-5 grid gap-5 sm:grid-cols-2"><label><span className="field-label">Vehicle Type (optional)</span><select className="field" value={vehicleType} onChange={(e) => setVehicleType(e.target.value as typeof vehicleType)}><option>Car</option><option>SUV</option><option>Pickup</option><option>Other</option></select></label><fieldset><legend className="field-label">Travelling with pets?</legend><div className="flex gap-5"><label className="flex min-h-12 items-center gap-2"><input type="radio" name="pets" checked={!pets} onChange={() => setPets(false)} />No</label><label className="flex min-h-12 items-center gap-2"><input type="radio" name="pets" checked={pets} onChange={() => setPets(true)} />Yes</label></div></fieldset></div>
        {pets && <p className="mt-4 border-l-4 border-[var(--rv-yellow)] bg-[var(--rv-cream)] p-3 text-sm">Pet-friendly rooms are subject to availability. The front desk will confirm any applicable pet fee.</p>}
        <label className="mt-5 block"><span className="field-label">Special Requests (optional)</span><textarea className="field min-h-28" value={specialRequests} onChange={(e) => setSpecialRequests(e.target.value)} maxLength={3000} placeholder="Kitchen needs, connecting rooms, multiple rooms, late arrival or anything else we should know." /></label>
        <label className="absolute -left-[10000px]" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
        <div className="mt-6 border-t pt-5"><p className="text-sm"><strong>Payment: Pay at Property.</strong> A valid credit card may be required to guarantee your reservation. Do not include card numbers in this form.</p><p className="mt-3 text-sm text-[var(--rv-muted)]">Submitting this form is a reservation request only. Your room is not confirmed until you receive a confirmation from Ranchland Villa Motel.</p></div>
        {formError && <div role="alert" className="mt-5 flex gap-2 border-l-4 border-red-700 bg-red-50 p-4 text-red-900"><AlertCircle className="shrink-0" />{formError}</div>}
        <button type="submit" disabled={submit.isPending} className="btn-primary mt-6 w-full sm:w-auto">{submit.isPending ? <><LoaderCircle className="animate-spin" />Sending Request…</> : <>Request Reservation<ArrowRight size={18} /></>}</button>
      </form>
    </div></section>}
    {!selected && !availability.isLoading && <section className="section-shell py-8 text-center"><p className="text-[var(--rv-muted)]">Select an available room type to continue. If nothing matches, please call <a className="font-bold underline" href={MOTEL.phoneHref}>{MOTEL.phone}</a>.</p></section>}
  </PublicLayout>;
}
