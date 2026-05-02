/**
 * Meeting transcript export
 * © Ken Baserecha — Boutyflameet
 *
 * Converts an in-meeting ChatMessage[] log into a clean, plain-text
 * transcript and triggers a browser download. Pure browser code — no
 * server round-trip, so it works whether or not Firebase is configured.
 */
import type { ChatMessage } from '../types';

export interface TranscriptMeta {
  roomId:    string;
  title?:    string | null;
  hostName?: string | null;
  startedAt?: number | null; // ms epoch — defaults to first message
  endedAt?:   number | null; // ms epoch — defaults to now
  summary?:   string | null; // optional AI-generated summary block
}

const pad = (n: number) => String(n).padStart(2, '0');

function fmtClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(startMs: number, endMs: number): string {
  const total = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function safeFilename(s: string): string {
  return s.replace(/[^a-z0-9-_]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'meeting';
}

/**
 * Build the full transcript text. Exported separately so callers can
 * preview or pipe it elsewhere (e.g. email, share sheet) without forcing
 * a download.
 */
export function buildTranscript(messages: ChatMessage[], meta: TranscriptMeta): string {
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const startedAt = meta.startedAt ?? sorted[0]?.timestamp ?? Date.now();
  const endedAt   = meta.endedAt   ?? sorted[sorted.length - 1]?.timestamp ?? Date.now();

  // Unique speaker list (preserves first-seen order).
  const speakers: string[] = [];
  for (const m of sorted) {
    if (m.type === 'system') continue;
    if (!speakers.includes(m.userName)) speakers.push(m.userName);
  }

  const lines: string[] = [];
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('  BOUTYFLAMEET — MEETING TRANSCRIPT');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Meeting:      ${meta.title || meta.roomId}`);
  lines.push(`Room ID:      ${meta.roomId}`);
  if (meta.hostName) lines.push(`Host:         ${meta.hostName}`);
  lines.push(`Started:      ${fmtDate(startedAt)}`);
  lines.push(`Ended:        ${fmtDate(endedAt)}`);
  lines.push(`Duration:     ${fmtDuration(startedAt, endedAt)}`);
  lines.push(`Participants: ${speakers.length > 0 ? speakers.join(', ') : '—'}`);
  lines.push(`Messages:     ${sorted.length}`);
  lines.push('');
  if (meta.summary && meta.summary.trim()) {
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('  AI SUMMARY');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('');
    for (const ln of meta.summary.trim().split(/\r?\n/)) {
      lines.push(ln);
    }
    lines.push('');
  }

  lines.push('───────────────────────────────────────────────────────────');
  lines.push('  CONVERSATION');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('');

  if (sorted.length === 0) {
    lines.push('  (No messages were exchanged in chat during this meeting.)');
  } else {
    for (const m of sorted) {
      const ts   = fmtClock(m.timestamp);
      const tag  = m.type === 'ai'
        ? '🤖 AI Assistant'
        : m.type === 'system'
          ? '⚙️  System'
          : m.userName;
      // Wrap long messages to 78 cols for readability.
      const wrapped = wrap(m.message, 78, '              ');
      lines.push(`[${ts}]  ${tag}:`);
      lines.push(`              ${wrapped}`);
      lines.push('');
    }
  }

  lines.push('───────────────────────────────────────────────────────────');
  lines.push(`Exported: ${fmtDate(Date.now())}`);
  lines.push('© Ken Baserecha — Boutyflameet');
  lines.push('');

  return lines.join('\n');
}

function wrap(text: string, width: number, indent: string): string {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (para.length <= width) { out.push(para); continue; }
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      if ((line + ' ' + w).trim().length > width) {
        out.push(line);
        line = w;
      } else {
        line = line ? line + ' ' + w : w;
      }
    }
    if (line) out.push(line);
  }
  return out.join('\n' + indent);
}

/**
 * Triggers a browser download of the transcript as a .txt file.
 * Filename: boutyflameet-{ROOMID}-{YYYYMMDD}.txt
 */
export function downloadTranscript(messages: ChatMessage[], meta: TranscriptMeta): void {
  const text = buildTranscript(messages, meta);
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const fname = `boutyflameet-${safeFilename(meta.roomId)}-${stamp}.txt`;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Calls the server AI proxy to generate a meeting summary from the
 * chat log. Returns the summary text (markdown-ish, plain text safe)
 * or throws if the AI is not available.
 *
 * The summary covers:
 *   - 2–3 sentence overview
 *   - Key topics discussed (bullets)
 *   - Decisions made (bullets)
 *   - Action items with owner where inferable (bullets)
 */
export async function generateAiSummary(
  messages: ChatMessage[],
  meta: { roomId: string; title?: string | null },
): Promise<string> {
  const sorted = [...messages]
    .sort((a, b) => a.timestamp - b.timestamp)
    .filter((m) => m.type !== 'system');

  if (sorted.length === 0) {
    throw new Error('No chat messages to summarize.');
  }

  // Compact transcript for the prompt — strip noise to save tokens.
  const lines = sorted.map((m) => {
    const tag = m.type === 'ai' ? 'AI Assistant' : m.userName;
    return `${tag}: ${m.message}`;
  });
  const transcriptForAI = lines.join('\n').slice(0, 3500);

  const system =
    'You are an expert meeting note-taker. Produce concise, actionable, ' +
    'plain-text summaries from a chat transcript. Never invent facts. ' +
    'If a section has no content, write "None".';

  const prompt = [
    `Meeting: ${meta.title || meta.roomId}`,
    `Room: ${meta.roomId}`,
    '',
    'Below is the in-meeting chat transcript. Produce a summary using',
    'EXACTLY this plain-text format (no markdown asterisks or hashes):',
    '',
    'Overview:',
    '  <2–3 sentences>',
    '',
    'Key Topics:',
    '  - <topic 1>',
    '  - <topic 2>',
    '',
    'Decisions:',
    '  - <decision 1>',
    '',
    'Action Items:',
    '  - <action> (owner: <name or "unassigned">)',
    '',
    '--- TRANSCRIPT ---',
    transcriptForAI,
  ].join('\n');

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, prompt, maxTokens: 700 }),
  });

  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `AI request failed (${res.status})`);
  }
  const text = (data.text || '').trim();
  if (!text) throw new Error('AI returned an empty summary.');
  return text;
}
