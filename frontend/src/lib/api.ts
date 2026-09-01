import { getToken } from './tokenStore.js';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4100/api/v1';

/** What a job needs: mains only, any off-grid source, solar-or-mains only, or none at all. */
export type PowerKind = 'grid' | 'flexible' | 'solar' | 'none';
/** What actually powered a scheduled job. */
export type ActualPowerKind = 'grid' | 'generator' | 'solar' | 'none';

export interface User {
  id: string;
  email: string;
  shopName: string;
  hasPassword: boolean;
  generatorLitersPerHour: number;
  fuelPricePerLiter: number;
  hasGenerator: boolean;
  hasSolar: boolean;
  solarStart: string | null;
  solarEnd: string | null;
}

export interface CutDto {
  id?: string;
  start: string;
  end: string;
}

export interface JobDraft {
  name: string;
  minutes: number;
  power: PowerKind;
}

export interface JobDto extends JobDraft {
  id: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  actualPower: ActualPowerKind | null;
  unscheduled: boolean;
  manuallyPlaced: boolean;
  attachment: { name: string; mime: string | null } | null;
}

export interface PlanSummary {
  id: string;
  label: string;
  shopOpen: string;
  shopClose: string;
  feasible: boolean | null;
  totalGeneratorMinutes: number | null;
  totalSolarMinutes: number | null;
  totalGeneratorCost: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanDetail extends PlanSummary {
  generatorLitersPerHour: number;
  fuelPricePerLiter: number;
  hasGenerator: boolean;
  hasSolar: boolean;
  solarStart: string | null;
  solarEnd: string | null;
  cuts: CutDto[];
  jobs: JobDto[];
}

export interface PlanInput {
  label: string;
  shopOpen: string;
  shopClose: string;
  cuts: { start: string; end: string }[];
  jobs: JobDraft[];
}

class ApiClientError extends Error {
  status: number;
  details?: string[];

  constructor(status: number, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers as Record<string, string> | undefined) } });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiClientError(res.status, body.error ?? `Request failed (${res.status})`, body.details);
  }
  return body as T;
}

export { ApiClientError };

export function signup(email: string, password: string, shopName: string) {
  return request<{ token: string; user: User }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, shopName }),
  });
}

export function login(email: string, password: string) {
  return request<{ token: string; user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function loginWithGoogle(credential: string) {
  return request<{ token: string; user: User }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function fetchMe() {
  return request<{ user: User }>('/auth/me');
}

export interface SettingsPatch {
  shopName?: string;
  generatorLitersPerHour?: number;
  fuelPricePerLiter?: number;
  hasGenerator?: boolean;
  hasSolar?: boolean;
  solarStart?: string;
  solarEnd?: string;
}

export function updateSettings(patch: SettingsPatch) {
  return request<{ user: User }>('/me', { method: 'PATCH', body: JSON.stringify(patch) });
}

export function listPlans() {
  return request<{ plans: PlanSummary[] }>('/plans');
}

export function getPlan(id: string) {
  return request<{ plan: PlanDetail }>(`/plans/${id}`);
}

export function createPlan(input: PlanInput) {
  return request<{ plan: PlanDetail }>('/plans', { method: 'POST', body: JSON.stringify(input) });
}

export function autoSchedule(id: string) {
  return request<{ plan: PlanDetail }>(`/plans/${id}/auto-schedule`, { method: 'POST' });
}

export function manualSchedule(id: string, placements: { jobId: string; start: string }[]) {
  return request<{ plan: PlanDetail }>(`/plans/${id}/manual-schedule`, {
    method: 'POST',
    body: JSON.stringify({ placements }),
  });
}

export function deletePlan(id: string) {
  return request<void>(`/plans/${id}`, { method: 'DELETE' });
}

export async function uploadAttachment(planId: string, jobId: string, file: File): Promise<{ name: string; mime: string }> {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/plans/${planId}/jobs/${jobId}/attachment`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiClientError(res.status, body.error ?? `Upload failed (${res.status})`);
  return body.attachment;
}

export async function downloadAttachment(planId: string, jobId: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}/plans/${planId}/jobs/${jobId}/attachment`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new ApiClientError(res.status, `Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function deleteAttachment(planId: string, jobId: string) {
  return request<void>(`/plans/${planId}/jobs/${jobId}/attachment`, { method: 'DELETE' });
}

export interface MeterReading {
  id: string;
  date: string;
  readingKwh: number;
  note: string | null;
}

export function listMeterReadings() {
  return request<{ readings: MeterReading[] }>('/meter');
}

export function createMeterReading(date: string, readingKwh: number, note?: string) {
  return request<{ reading: MeterReading }>('/meter', {
    method: 'POST',
    body: JSON.stringify({ date, readingKwh, note }),
  });
}

export function deleteMeterReading(id: string) {
  return request<void>(`/meter/${id}`, { method: 'DELETE' });
}
