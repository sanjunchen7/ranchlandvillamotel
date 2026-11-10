import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type GalleryImage = { id: number; url: string; thumbnail?: string | null; alt: string; caption?: string | null };

export function RoomGallery({ images, placeholder, name }: { images: GalleryImage[]; placeholder: string; name: string }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const shown = images.length ? images : [{ id: 0, url: placeholder, alt: `${name} photo coming soon — placeholder`, caption: "Photo coming soon. This is a placeholder, not a motel photograph." }];
  const current = shown[Math.min(active, shown.length - 1)];
  const move = useCallback((direction: number) => setActive((value) => (value + direction + shown.length) % shown.length), [shown.length]);
  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    };
    document.addEventListener("keydown", listener);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", listener); document.body.style.overflow = ""; };
  }, [open, move]);
  return <>
    <div>
      <button className="group relative block w-full overflow-hidden bg-[var(--rv-cream)] text-left" onClick={() => setOpen(true)} aria-label={`Open ${name} photo gallery`}>
        <img src={current.url} alt={current.alt} className="aspect-[16/10] w-full object-cover transition duration-200 group-hover:scale-[1.015]" loading="lazy" />
        <span className="absolute bottom-3 right-3 bg-[var(--rv-navy)] px-3 py-1.5 text-xs font-bold text-white">{images.length ? `${Math.min(active + 1, images.length)} / ${images.length}` : "PHOTO COMING SOON"}</span>
      </button>
      {shown.length > 1 && <div className="mt-2 flex gap-2 overflow-x-auto pb-2">{shown.map((image, index) => <button key={image.id} onClick={() => setActive(index)} className={`shrink-0 border-2 ${index === active ? "border-[var(--rv-navy)]" : "border-transparent"}`} aria-label={`View photo ${index + 1}`}><img src={image.thumbnail || image.url} alt="" className="h-20 w-28 object-cover" loading="lazy" /></button>)}</div>}
    </div>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label={`${name} photo gallery`} onClick={() => setOpen(false)} onTouchStart={(e) => setTouchStart(e.touches[0].clientX)} onTouchEnd={(e) => { if (touchStart == null) return; const delta = e.changedTouches[0].clientX - touchStart; if (Math.abs(delta) > 50) move(delta > 0 ? -1 : 1); setTouchStart(null); }}>
      <button autoFocus className="absolute right-4 top-4 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white text-slate-900" onClick={() => setOpen(false)} aria-label="Close gallery"><X /></button>
      {shown.length > 1 && <button className="absolute left-3 z-10 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white text-slate-900 md:left-8" onClick={(e) => { e.stopPropagation(); move(-1); }} aria-label="Previous photo"><ChevronLeft /></button>}
      <figure className="lightbox-enter max-h-[90dvh] w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
        <img src={current.url} alt={current.alt} className="mx-auto max-h-[78dvh] max-w-full object-contain" />
        <figcaption className="mt-3 text-center text-sm text-white">{current.caption || current.alt}</figcaption>
      </figure>
      {shown.length > 1 && <button className="absolute right-3 z-10 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white text-slate-900 md:right-8" onClick={(e) => { e.stopPropagation(); move(1); }} aria-label="Next photo"><ChevronRight /></button>}
    </div>}
  </>;
}
