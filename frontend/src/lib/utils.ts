import { ROOM_PREFIX } from './constants';

/** Generates a unique room ID like BOUTY-F4R7K2 */
export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${ROOM_PREFIX}-${s}`;
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1)  return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function getInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?';
}

export function getPeerColor(id: string): string {
  const colors = [
    'linear-gradient(135deg,#7C3AED,#A855F7)',
    'linear-gradient(135deg,#059669,#10B981)',
    'linear-gradient(135deg,#DC2626,#F87171)',
    'linear-gradient(135deg,#2563EB,#60A5FA)',
    'linear-gradient(135deg,#D97706,#FBBF24)',
    'linear-gradient(135deg,#DB2777,#F472B6)',
    'linear-gradient(135deg,#0891B2,#22D3EE)',
    'linear-gradient(135deg,#65A30D,#A3E635)',
  ];
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const el = Object.assign(document.createElement('textarea'), { value: text });
    el.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10);
export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
