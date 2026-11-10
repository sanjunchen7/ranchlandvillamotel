import { describe, expect, it } from "vitest";
import { addDays, canTransition, isDateString, money, motelToday, nightsBetween, rangesOverlap, safeCardLast4, timeToMinutes, validateStay } from "./rules";

const validStay = { checkIn: "2026-11-10", checkOut: "2026-11-12", adults: 1, children: 0, infants: 5, preferredCheckInTime: "2:00 PM" };
const now = new Date("2026-11-10T12:00:00Z");

describe("date and occupancy rules", () => {
  it("uses half-open stay intervals so checkout and check-in can share a day", () => {
    expect(rangesOverlap("2026-11-10", "2026-11-12", "2026-11-12", "2026-11-14")).toBe(false);
    expect(rangesOverlap("2026-11-10", "2026-11-12", "2026-11-11", "2026-11-14")).toBe(true);
  });
  it("counts nights without counting the checkout day", () => {
    expect(nightsBetween("2026-11-10", "2026-11-12")).toEqual(["2026-11-10", "2026-11-11"]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("validates real calendar dates", () => {
    expect(isDateString("2026-02-29")).toBe(false);
    expect(isDateString("2028-02-29")).toBe(true);
  });
  it("rejects past dates, reversed dates and missing adults", () => {
    expect(validateStay({ ...validStay, checkIn: "2026-11-09" }, now)).toContain("Check-in cannot be in the past.");
    expect(validateStay({ ...validStay, checkOut: "2026-11-10" }, now)).toContain("Check-out must be after check-in.");
    expect(validateStay({ ...validStay, adults: 0 }, now)).toContain("At least one adult is required.");
  });
  it("allows infants without an artificial cap", () => {
    expect(validateStay(validStay, now)).toEqual([]);
  });
  it("uses the motel timezone for today", () => {
    expect(motelToday(new Date("2026-11-10T07:00:00Z"))).toBe("2026-11-09");
  });
});

describe("check-in and state rules", () => {
  it("rejects preferred check-in before noon", () => {
    expect(timeToMinutes("12:00 PM")).toBe(720);
    expect(validateStay({ ...validStay, preferredCheckInTime: "11:59 AM" }, now)).toContain("Preferred check-in cannot be earlier than 12:00 PM.");
  });
  it("requires admin override to confirm while awaiting guarantee", () => {
    expect(canTransition("AWAITING_GUARANTEE", "CONFIRMED")).toBe(false);
    expect(canTransition("AWAITING_GUARANTEE", "CONFIRMED", true)).toBe(true);
    expect(canTransition("CARD_GUARANTEED", "CONFIRMED")).toBe(true);
  });
  it("rejects invalid reverse transitions", () => {
    expect(canTransition("CHECKED_OUT", "CONFIRMED")).toBe(false);
    expect(canTransition("CHECKED_IN", "CONFIRMED")).toBe(false);
    expect(canTransition("CONFIRMED", "NO_SHOW")).toBe(true);
  });
});

describe("money and card safety", () => {
  it("rounds money to cents consistently", () => {
    expect(money("119.006")).toBe(11901);
    expect(money("0.10") + money("0.20")).toBe(30);
  });
  it("allows only four digits for optional card references", () => {
    expect(safeCardLast4("1234")).toBe(true);
    expect(safeCardLast4("123456789")).toBe(false);
    expect(safeCardLast4("12a4")).toBe(false);
    expect(safeCardLast4(undefined)).toBe(true);
  });
});
