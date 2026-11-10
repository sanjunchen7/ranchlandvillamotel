import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Car, Check, Clock3, CookingPot, Dog, MapPin, Wifi } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PublicLayout, usePageTitle } from "@/components/PublicLayout";
import { AvailabilityWidget } from "@/components/AvailabilityWidget";
import { MOTEL } from "@contracts/business";
import { PhotoLightbox } from "@/components/PhotoLightbox";

const amenities = ["Free Wi-Fi", "Free Parking", "Air Conditioning", "Heating", "TV / Cable", "Microwave", "Refrigerator", "Coffee Maker", "Hair Dryer", "Bathtub / Shower", "Ground-Floor Rooms", "24-Hour Front Desk", "Kitchen Rooms Available", "Pet-Friendly Rooms Available"];

export default function Home() {
  usePageTitle("Ground-Floor Motel Rooms in Merritt");
  const { data, isLoading, error } = trpc.public.bootstrap.useQuery();
  const [activeGallery, setActiveGallery] = useState<number | null>(null);
  if (isLoading) return <PublicLayout><div className="section-shell py-24"><p className="text-lg">Loading motel information…</p></div></PublicLayout>;
  if (error || !data) return <PublicLayout><div className="section-shell py-24"><h1 className="section-title">We couldn’t load room information.</h1><p className="mt-4">Please call {MOTEL.phone} for availability.</p></div></PublicLayout>;
  const fromPrice = Math.round(Number(data.settings.public_from_rate || 119));
  const gallery: { url: string; alt: string; caption?: string | null }[] = data.gallery.filter((item) => item.url).map((item) => ({ id: item.id, url: item.url!, alt: item.alt, caption: item.caption }));
  gallery.push(
    { url: "/placeholders/exterior.svg", alt: "Motel exterior photo coming soon" },
    { url: "/placeholders/parking.svg", alt: "Parking area photo coming soon" },
    { url: "/placeholders/queen.svg", alt: "Queen room photo coming soon" },
    { url: "/placeholders/kitchen.svg", alt: "Kitchen photo coming soon" },
  );
  const visibleGallery = gallery.slice(0, 8);
  return <PublicLayout>
    <section className="navy-panel overflow-hidden">
      <div className="section-shell grid items-stretch gap-0 py-8 md:grid-cols-12 md:py-14">
        <div className="relative z-10 flex flex-col justify-center py-8 md:col-span-5 md:py-16">
          <p className="eyebrow text-[var(--rv-charcoal)]">Merritt, British Columbia</p>
          <h1 className="display-title mt-5">{String(data.settings.hero_text || "A practical stop. A comfortable night.")}</h1>
          <p className="mt-6 max-w-lg text-lg text-[var(--rv-charcoal)]">Clean, comfortable ground-floor rooms with free parking, free Wi-Fi and a 24-hour front desk—right when you need a straightforward place to stay.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link to="/availability" className="btn-primary">Check Availability<ArrowRight size={18} /></Link><Link to="/rooms" className="btn-light">Explore Rooms</Link></div>
          <p className="mt-6 text-sm text-[var(--rv-charcoal)]">Rooms from <strong className="text-[var(--rv-charcoal)] underline underline-offset-4">CA${fromPrice}/night</strong> · Reservation requests are confirmed by our front desk.</p>
        </div>
        <div className="relative md:col-span-7 md:pl-10">
          <div className="h-full min-h-[320px] overflow-hidden md:min-h-[500px]"><img src={data.hero?.url || "/placeholders/hero.svg"} alt={data.hero?.alt || "Ranchland Villa Motel exterior photo coming soon — placeholder"} className="h-full w-full object-cover" /></div>
          <div className="relative z-10 -mt-8 ml-5 max-w-sm bg-[var(--rv-cream)] p-5 text-[var(--rv-charcoal)] md:absolute md:-bottom-5 md:left-0 md:ml-0"><p className="eyebrow text-[var(--rv-navy)]">Road-trip friendly</p><p className="mt-2 font-semibold">Easy parking for cars, SUVs and pickups. Every public rental room is on the ground floor.</p></div>
        </div>
      </div>
    </section>

    <section className="relative z-10 -mt-1 bg-[var(--rv-paper)] py-8 md:-mt-8 md:py-0" aria-label="Availability search">
      <div className="section-shell"><div className="offset-block border-2 border-[var(--rv-navy)] bg-[var(--rv-paper)] p-5 md:p-7"><AvailabilityWidget today={data.today} compact /><p className="mt-4 text-sm text-[var(--rv-muted)]">A search shows room types available to request. Your room is not held or confirmed until the motel contacts you.</p></div></div>
    </section>

    <section className="section-shell grid gap-10 py-20 md:grid-cols-12 md:py-28">
      <div className="md:col-span-4"><p className="eyebrow text-[var(--rv-navy)]">Why stay here</p><h2 className="section-title mt-3">The essentials, done properly.</h2></div>
      <div className="grid gap-x-8 gap-y-8 sm:grid-cols-3 md:col-span-8">
        {[{ icon: Car, title: "Park close", text: "Free, convenient parking for your car, SUV or pickup." }, { icon: CookingPot, title: "Stay your way", text: "Kitchen-equipped rooms are available in select rooms for longer stays." }, { icon: Clock3, title: "Arrive when you arrive", text: "Our front desk is available 24 hours. Late arrival? Call ahead for key pickup." }].map((item) => <div key={item.title} className="border-t-2 border-[var(--rv-navy)] pt-5"><item.icon size={26} className="text-[var(--rv-navy)]" /><h3 className="mt-4 text-xl font-bold">{item.title}</h3><p className="mt-2 text-[var(--rv-muted)]">{item.text}</p></div>)}
      </div>
    </section>

    <section className="bg-[var(--rv-cream)] py-20 md:py-24">
      <div className="section-shell"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow text-[var(--rv-navy)]">Featured rooms</p><h2 className="section-title mt-3">Choose the space you need.</h2></div><Link to="/rooms" className="btn-secondary">View all room types<ArrowRight size={17} /></Link></div>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">{data.roomTypes.slice(0, 3).map((room, index) => <article key={room.id} className={`flex flex-col border-t-2 border-[var(--rv-navy)] bg-[var(--rv-paper)] ${index === 0 ? "md:col-span-2 lg:col-span-1" : ""}`}>
          <img src={room.gallery[0]?.url || room.placeholder} alt={room.gallery[0]?.alt || `${room.name} photo coming soon — placeholder`} className="aspect-[16/10] w-full object-cover" loading="lazy" />
          <div className="flex flex-1 flex-col p-5"><h3 className="display-font text-2xl font-bold">{room.name}</h3><p className="mt-2 font-semibold">{room.bedDescription} · Up to {room.maxOccupancy} guests</p><p className="mt-1 text-sm text-[var(--rv-muted)]">{room.kitchenCopy}</p><div className="mt-auto flex items-center justify-between gap-3 pt-6"><span className="font-bold">From CA${fromPrice}<small className="font-normal">/night</small></span><Link to={`/rooms#${room.slug}`} className="font-bold text-[var(--rv-navy)] underline underline-offset-4">View Room</Link></div></div>
        </article>)}</div>
      </div>
    </section>

    <section className="section-shell grid gap-12 py-20 md:grid-cols-12 md:py-24">
      <div className="md:col-span-5"><p className="eyebrow text-[var(--rv-navy)]">Amenities</p><h2 className="section-title mt-3">Everything for a practical stay.</h2><p className="mt-5 max-w-md text-[var(--rv-muted)]">Kitchen-equipped rooms usually include a stove, oven, microwave, refrigerator, coffee maker and basic cookware. Not every room has a kitchen.</p></div>
      <ul className="grid gap-x-6 gap-y-4 sm:grid-cols-2 md:col-span-7">{amenities.map((amenity) => <li key={amenity} className="flex items-center gap-3 border-b pb-3"><Check size={18} className="shrink-0 text-[var(--rv-navy)]" />{amenity}</li>)}</ul>
    </section>

    <section className="overflow-hidden bg-[var(--rv-navy)] py-20 text-[var(--rv-cream)]">
      <div className="section-shell"><p className="eyebrow text-[var(--rv-yellow)]">Explore Ranchland Villa Motel</p><h2 className="section-title mt-3">A closer look before you arrive.</h2><div className="mt-10 flex snap-x gap-4 overflow-x-auto pb-4 md:grid md:grid-cols-4 md:overflow-visible">{visibleGallery.map((image, index) => <figure key={`${image.url}-${index}`} className="w-[78vw] shrink-0 snap-start md:w-auto"><button className="block w-full text-left" onClick={() => setActiveGallery(index)} aria-label={`Open photo ${index + 1}: ${image.alt}`}><img src={image.url} alt={image.alt} className="aspect-[4/3] w-full object-cover transition duration-200 hover:scale-[1.015]" loading="lazy" /></button><figcaption className="mt-2 text-sm">{"caption" in image && image.caption ? image.caption : image.alt}</figcaption></figure>)}</div><p className="mt-4 text-sm">Photos marked “coming soon” are placeholders, not photographs of the motel. Room layout and furnishings may vary slightly by room.</p></div>
    </section>

    <section className="section-shell grid gap-6 py-20 md:grid-cols-3 md:py-24">
      {[{ icon: CookingPot, title: "Kitchen rooms", text: "Prefer or require a kitchen? Tell us in your reservation request and our front desk will confirm availability." }, { icon: Dog, title: "Pet-friendly rooms", text: String(data.settings.pet_copy || "Contact the front desk for current pet fees and availability.") }, { icon: Wifi, title: "Longer stays welcome", text: "Free Wi-Fi, practical amenities and select kitchen rooms make work trips and longer stays easier." }].map((item) => <article key={item.title} className="border-l-2 border-[var(--rv-yellow)] pl-6"><item.icon size={28} className="text-[var(--rv-navy)]" /><h2 className="display-font mt-4 text-3xl font-bold">{item.title}</h2><p className="mt-3 text-[var(--rv-muted)]">{item.text}</p></article>)}
    </section>

    <section className="bg-[var(--rv-yellow)] py-14 text-[var(--rv-navy-deep)]"><div className="section-shell flex flex-col gap-8 md:flex-row md:items-center md:justify-between"><div><h2 className="display-font text-4xl font-bold">Ready to plan your stop in Merritt?</h2><p className="mt-2 flex items-center gap-2 font-semibold"><MapPin size={19} />{MOTEL.address}</p></div><div className="flex flex-wrap gap-3"><Link to="/availability" className="btn-secondary">Request Reservation</Link><a href={MOTEL.phoneHref} className="btn-secondary">Call {MOTEL.phone}</a></div></div></section>
    <PhotoLightbox images={visibleGallery} active={activeGallery} onClose={() => setActiveGallery(null)} onChange={setActiveGallery} />
  </PublicLayout>;
}
