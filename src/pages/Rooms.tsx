import { Link } from "react-router";
import { ArrowRight, BedDouble, CookingPot, Users } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { PublicLayout, usePageTitle } from "@/components/PublicLayout";
import { RoomGallery } from "@/components/RoomGallery";

export default function Rooms() {
  usePageTitle("Rooms & Bed Types");
  const { data, isLoading } = trpc.public.bootstrap.useQuery();
  const fromPrice = Math.round(Number(data?.settings.public_from_rate || 119));
  return <PublicLayout>
    <section className="section-shell py-14 md:py-20"><p className="eyebrow text-[var(--rv-navy)]">Rooms at Ranchland Villa</p><h1 className="display-title mt-4 max-w-4xl">A straightforward room for every kind of stay.</h1><p className="mt-6 max-w-2xl text-lg text-[var(--rv-muted)]">All public rental rooms are on the ground floor, with free Wi-Fi and convenient parking. Choose a room type; our front desk assigns the specific room number.</p></section>
    {isLoading && <div className="section-shell pb-20">Loading room types…</div>}
    <div className="section-shell flex flex-col gap-20 pb-10">{data?.roomTypes.map((room, index) => <article id={room.slug} key={room.id} className="scroll-mt-28 border-t-2 border-[var(--rv-navy)] pt-8">
      <div className={`grid gap-8 md:grid-cols-12 ${index % 2 ? "md:[&>*:first-child]:order-2" : ""}`}>
        <div className="md:col-span-7"><RoomGallery images={room.gallery.filter((photo) => photo.url).map((photo) => ({ ...photo, url: photo.url! }))} placeholder={room.placeholder} name={room.name} /></div>
        <div className="flex flex-col md:col-span-5 md:py-4"><p className="eyebrow text-[var(--rv-navy)]">Room type {String(index + 1).padStart(2, "0")}</p><h2 className="display-font mt-3 text-4xl font-bold">{room.name}</h2><p className="mt-4 text-[var(--rv-muted)]">{room.description}</p>
          <ul className="mt-6 flex flex-col gap-3 border-y py-5"><li className="flex items-center gap-3"><BedDouble size={20} className="text-[var(--rv-navy)]" />{room.bedDescription}</li><li className="flex items-center gap-3"><Users size={20} className="text-[var(--rv-navy)]" />Up to {room.maxOccupancy} guests <span className="text-sm text-[var(--rv-muted)]">(infants under 2 not counted)</span></li><li className="flex items-center gap-3"><CookingPot size={20} className="text-[var(--rv-navy)]" />{room.kitchenCopy}</li></ul>
          <p className="mt-5 text-xl font-bold">From CA${fromPrice}<span className="text-sm font-normal">/night</span></p><p className="mt-1 text-sm text-[var(--rv-muted)]">Final nightly pricing and taxes are shown in your estimate.</p><Link to={`/availability?roomTypeId=${room.id}`} className="btn-primary mt-6 self-start">Request This Room Type<ArrowRight size={18} /></Link>
        </div>
      </div>
    </article>)}</div>
    <section className="section-shell py-12"><div className="paper-panel p-6 md:p-8"><h2 className="display-font text-2xl font-bold">Good to know</h2><ul className="mt-4 grid gap-3 md:grid-cols-2"><li>Room layout and furnishings may vary slightly by room.</li><li>Kitchen availability is subject to confirmation by the motel.</li><li>Connecting rooms may be available upon request. Please contact the front desk.</li><li>Pet-friendly rooms are subject to availability; ask the front desk about current fees.</li></ul></div></section>
  </PublicLayout>;
}
