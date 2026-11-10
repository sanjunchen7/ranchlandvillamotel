import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function PhotoLightbox({ images, active, onClose, onChange }: { images: { url: string; alt: string; caption?: string | null }[]; active: number | null; onClose: () => void; onChange: (index: number) => void }) {
  const [touch, setTouch] = useState<number | null>(null);
  const move = useCallback((direction: number) => { if (active !== null) onChange((active + direction + images.length) % images.length); }, [active, images.length, onChange]);
  useEffect(() => {
    if (active === null) return;
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); if (event.key === "ArrowRight") move(1); if (event.key === "ArrowLeft") move(-1); };
    document.addEventListener("keydown", listener); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", listener); document.body.style.overflow = ""; };
  }, [active, move, onClose]);
  if (active === null || !images[active]) return null;
  const image = images[active];
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4" role="dialog" aria-modal="true" aria-label="Homepage photo gallery" onClick={onClose} onTouchStart={(e) => setTouch(e.touches[0].clientX)} onTouchEnd={(e) => { if (touch === null) return; const delta = e.changedTouches[0].clientX - touch; if (Math.abs(delta) > 50) move(delta > 0 ? -1 : 1); setTouch(null); }}>
    <button autoFocus className="absolute right-4 top-4 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white text-slate-900" onClick={onClose} aria-label="Close gallery"><X /></button>
    <button className="absolute left-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white text-slate-900 md:left-8" onClick={(e) => { e.stopPropagation(); move(-1); }} aria-label="Previous photo"><ChevronLeft /></button>
    <figure className="lightbox-enter max-w-6xl" onClick={(e) => e.stopPropagation()}><img src={image.url} alt={image.alt} className="max-h-[78dvh] max-w-full object-contain" /><figcaption className="mt-3 text-center text-sm text-white">{image.caption || image.alt} · {active + 1} / {images.length}</figcaption></figure>
    <button className="absolute right-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white text-slate-900 md:right-8" onClick={(e) => { e.stopPropagation(); move(1); }} aria-label="Next photo"><ChevronRight /></button>
  </div>;
}
