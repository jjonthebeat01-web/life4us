import type { FormatId } from "./types";

export interface Template {
  id: string;
  name: string;
  swatch: string; // cell fill color for strip preview
  stripBase: string; // bottom tab color
}

export const TEMPLATES: Template[] = [
  { id: "pink", name: "pink", swatch: "#F6D9E4", stripBase: "#E8547A" },
  { id: "cream", name: "cream", swatch: "#F2ECE2", stripBase: "#A8977E" },
  { id: "noir", name: "noir", swatch: "#141210", stripBase: "#000000" },
];

export interface FormatOption {
  id: FormatId;
  label: string;
  description: string;
  cols: number;
  rows: number;
}

export const FORMATS: FormatOption[] = [
  { id: "1x4", label: "1×4", description: "one column, four shots", cols: 1, rows: 4 },
  { id: "2x2", label: "2×2", description: "two by two grid", cols: 2, rows: 2 },
  { id: "2x4", label: "2×4", description: "two columns, eight shots", cols: 2, rows: 4 },
];

export interface FilterOption {
  id: string;
  label: string;
  css: string; // CSS filter() value
}

export const FILTERS: FilterOption[] = [
  { id: "none", label: "original", css: "none" },
  { id: "bw", label: "b&w", css: "grayscale(1) contrast(1.05)" },
  { id: "warm", label: "warm", css: "sepia(0.35) saturate(1.25) contrast(1.02)" },
  { id: "faded", label: "faded", css: "saturate(0.7) brightness(1.08) contrast(0.92)" },
  { id: "punch", label: "punch", css: "saturate(1.4) contrast(1.15)" },
];

export function templateById(id: string | null) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function formatById(id: string | null) {
  return FORMATS.find((f) => f.id === id) ?? FORMATS[0];
}

export function filterById(id: string) {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}