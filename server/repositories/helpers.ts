/**
 * Shared repository helpers: UTC timestamps, pagination math, and result
 * shaping for list endpoints.
 */

/** Current time as a UTC ISO-8601 string (the storage format everywhere). */
export function now(): string {
  return new Date().toISOString();
}

export interface Page {
  page: number;
  pageSize: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function totalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 0;
  return Math.ceil(total / pageSize) || 0;
}

/** Shape a list + total into the canonical `{ items, total, page, ... }` DTO. */
export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return { items, total, page, pageSize, totalPages: totalPages(total, pageSize) };
}

/** Clamp a raw page/pageSize from query params to safe integers. */
export function clampPage(rawPage: unknown, rawPageSize: unknown, max = 100): Page {
  let page = Number.parseInt(String(rawPage ?? "1"), 10);
  let pageSize = Number.parseInt(String(rawPageSize ?? "20"), 10);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > max) pageSize = max;

  return { page, pageSize };
}

export const DEFAULTS = {
  suggestionsPerHour: 10,
  suggestionsPerDay: 30,
  minIntervalSeconds: 5,
  duplicateWindowMinutes: 10,
} as const;
