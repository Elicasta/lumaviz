import type { UnitSystem } from "./types";

export const METERS_PER_FOOT = 0.3048;

export function feetToMeters(feet: number): number {
  return feet * METERS_PER_FOOT;
}

export function metersToFeet(meters: number): number {
  return meters / METERS_PER_FOOT;
}

export function displayDistance(meters: number, units: UnitSystem): number {
  const value = units === "ft" ? metersToFeet(meters) : meters;
  return Number(value.toFixed(units === "ft" ? 2 : 3));
}

export function inputDistance(value: number, units: UnitSystem): number {
  return units === "ft" ? feetToMeters(value) : value;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
