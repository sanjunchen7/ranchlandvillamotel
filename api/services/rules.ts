import { ALLOWED_TRANSITIONS, MOTEL, type ReservationStatus } from "@contracts/business";

export function isDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && aEnd > bStart;
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: string, checkOut: string) {
  const nights: string[] = [];
  for (let day = checkIn; day < checkOut; day = addDays(day, 1)) nights.push(day);
  return nights;
}

export function motelToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOTEL.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function validateStay(input: {
  checkIn: string; checkOut: string; adults: number; children: number; infants: number;
  preferredCheckInTime: string;
}, now = new Date()) {
  const errors: string[] = [];
  if (!isDateString(input.checkIn) || !isDateString(input.checkOut)) errors.push("Please enter valid dates.");
  else {
    if (input.checkIn < motelToday(now)) errors.push("Check-in cannot be in the past.");
    if (input.checkOut <= input.checkIn) errors.push("Check-out must be after check-in.");
    if (nightsBetween(input.checkIn, input.checkOut).length > 30) errors.push("For stays over 30 nights, please contact the front desk.");
  }
  if (!Number.isInteger(input.adults) || input.adults < 1) errors.push("At least one adult is required.");
  if (!Number.isInteger(input.children) || input.children < 0 || !Number.isInteger(input.infants) || input.infants < 0) errors.push("Guest counts cannot be negative.");
  if (timeToMinutes(input.preferredCheckInTime) < 12 * 60) errors.push("Preferred check-in cannot be earlier than 12:00 PM.");
  return errors;
}

export function timeToMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})\s(AM|PM)$/i.exec(value.trim());
  if (!match) return -1;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  const minutes = Number(match[2]);
  return hour >= 0 && hour < 24 && minutes >= 0 && minutes < 60 ? hour * 60 + minutes : -1;
}

export function canTransition(from: ReservationStatus, to: ReservationStatus, adminOverride = false) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) return false;
  if (from === "AWAITING_GUARANTEE" && to === "CONFIRMED" && !adminOverride) return false;
  return true;
}

export function money(value: number | string) {
  return Math.round(Number(value) * 100);
}

export function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

export function safeCardLast4(value?: string) {
  return !value || /^\d{4}$/.test(value);
}
