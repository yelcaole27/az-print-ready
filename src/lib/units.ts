import { Unit } from '@/types';

export function mmToUnit(mm: number, unit: Unit): number {
  switch (unit) {
    case 'cm':
      return mm / 10;
    case 'in':
      return mm / 25.4;
    case 'mm':
    default:
      return mm;
  }
}

export function unitToMm(value: number, unit: Unit): number {
  switch (unit) {
    case 'cm':
      return value * 10;
    case 'in':
      return value * 25.4;
    case 'mm':
    default:
      return value;
  }
}

export function formatSize(mm: number, unit: Unit): string {
  const converted = mmToUnit(mm, unit);
  const rounded = Math.round(converted * 100) / 100;
  return `${rounded} ${unit}`;
}
