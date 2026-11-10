import { Link } from "react-router";
import { PublicLayout, usePageTitle } from "@/components/PublicLayout";
import { MOTEL } from "@contracts/business";

const faqs = [
  ["What time is check-in?", "Standard check-in begins at 2:00 PM. Early check-in may be available from 12:00 PM by arrangement with the front desk and subject to room availability."],
  ["What time is check-out?", "Check-out is at 11:00 AM. Please contact the front desk if you need to request a later departure."],
  ["Do you have kitchen rooms?", "Kitchen-equipped rooms are available in select rooms. Please let us know if you prefer or require a kitchen when making your reservation request. Availability is confirmed by the motel."],
  ["Are pets allowed?", "Pet-friendly rooms are available. Please contact the front desk for current pet fees and availability. Any applicable fee is confirmed by the front desk."],
  ["Do you have parking?", "Yes. Parking is free and convenient for regular cars, SUVs and pickups. All public rental rooms are on the ground floor."],
  ["Do I pay online?", "No. Payment is at the property. A valid credit card may be required to guarantee your reservation; our front desk handles that separately and the website never asks for a full card number or CVV."],
  ["Is my reservation confirmed immediately?", "No. Submitting the form creates a reservation request only. Your room is not confirmed until you receive a confirmation from Ranchland Villa Motel."],
  ["Can I arrive late?", "Yes. Guests arriving late are encouraged to contact the front desk in advance to arrange key pickup. Our front desk is available 24 hours."],
  ["Can I request connecting or multiple rooms?", "Connecting rooms may be available upon request. Mention multiple or connecting rooms in Special Requests, or contact the front desk for availability."],
  ["What if my travel plans change?", "Please contact the motel as soon as possible so our front desk can help with your reservation."],
];

export default function FAQ() {
  usePageTitle("Frequently Asked Questions");
  return <PublicLayout><section className="navy-panel py-14 md:py-20"><div className="section-shell"><p className="eyebrow text-[var(--rv-charcoal)]">Good to know</p><h1 className="display-title mt-4">Frequently asked questions.</h1><p className="mt-5 max-w-xl text-lg">Practical answers before your stay. Need something else? Call or text our 24-hour front desk.</p></div></section><section className="section-shell max-w-4xl py-14"><div className="border-t-2 border-[var(--rv-navy)]">{faqs.map(([question, answer], index) => <details key={question} className="group border-b" open={index === 0}><summary className="flex min-h-16 items-center justify-between gap-4 py-4 text-lg font-bold text-[var(--rv-navy)]"><span>{question}</span><span className="text-2xl transition group-open:rotate-45" aria-hidden="true">+</span></summary><p className="max-w-[70ch] pb-6 text-[var(--rv-muted)]">{answer}</p></details>)}</div><div className="mt-10 bg-[var(--rv-cream)] p-6"><h2 className="display-font text-2xl font-bold">Still have a question?</h2><p className="mt-2">Call <a className="font-bold underline" href={MOTEL.phoneHref}>{MOTEL.phone}</a> or text <a className="font-bold underline" href={MOTEL.textHref}>{MOTEL.text}</a>.</p><Link to="/availability" className="btn-primary mt-5">Check Availability</Link></div></section></PublicLayout>;
}
