export const RESERVATION_STATUSES = [
  "REQUESTED", "REVIEWING", "AWAITING_GUARANTEE", "CARD_GUARANTEED",
  "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "DECLINED", "CANCELLED", "NO_SHOW",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const OCCUPYING_STATUSES: ReservationStatus[] = ["CONFIRMED", "CHECKED_IN"];

export const ALLOWED_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  REQUESTED: ["REVIEWING", "DECLINED", "CANCELLED"],
  REVIEWING: ["AWAITING_GUARANTEE", "DECLINED", "CANCELLED"],
  AWAITING_GUARANTEE: ["CARD_GUARANTEED", "CONFIRMED", "CANCELLED"],
  CARD_GUARANTEED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["CHECKED_OUT"],
  CHECKED_OUT: [], DECLINED: [], CANCELLED: [], NO_SHOW: [],
};

export const MOTEL = {
  name: "Ranchland Villa Motel",
  address: "2379 Nicola Ave, Merritt, BC, Canada",
  phone: "250-378-2140",
  phoneHref: "tel:+12503782140",
  text: "347-630-5076",
  textHref: "sms:+13476305076",
  email: "ranchlandmotel2379@gmail.com",
  timezone: "America/Vancouver",
} as const;

export const DEFAULT_SETTINGS = {
  public_from_rate: "119.00",
  default_hold_hours: 24,
  standard_check_in: "2:00 PM",
  earliest_early_check_in: "12:00 PM",
  check_out: "11:00 AM",
  front_desk_hours: "24 hours",
  hero_text: "A practical stop. A comfortable night.",
  pet_copy: "Pet-friendly rooms are available. Please contact the front desk for current pet fees and availability.",
  late_arrival_copy: "Guests arriving late are encouraged to contact the front desk in advance to arrange key pickup.",
  ga4_enabled: false,
  ga4_measurement_id: "",
} as const;
