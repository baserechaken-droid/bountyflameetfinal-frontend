/**
 * BackgroundPanel — Slide-in panel for virtual background + audio settings
 */
import React, { useRef } from 'react';
import { X, Upload, Check, Mic, Volume2, Sliders } from 'lucide-react';
import { BgOption, BACKGROUND_OPTIONS } from '../hooks/useVirtualBackground';
import { AudioSettings } from '../hooks/useAudioProcessing';

interface BackgroundPanelProps {
  selected:         BgOption;
  onSelect:         (opt: BgOption) => void;
  onUpload:         (file: File) => void;
  audioSettings:    AudioSettings;
  onAudioChange:    (patch: Partial<AudioSettings>) => void;
  segReady:         boolean;
  loading:          boolean;
  onClose:          () => void;
}

export function BackgroundPanel({
  selected, onSelect, onUpload,
  audioSettings, onAudioChange,
  segReady, loading, onClose,
}: BackgroundPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) onUpload(file);
  };

  return (
    <div className="flex flex-col h-full glass-dark border-l border-white/[0.06] w-full md:w-[320px] animate-slide-right overflow-y-auto hide-scrollbar">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0 sticky top-0 bg-dark-900/95 z-10">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Sliders size={14} className="text-flame-500" />
          Background & Audio
        </h2>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 p-4 flex flex-col gap-6">

        {/* ── Virtual Background ────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">Virtual Background</span>
            {loading && (
              <span className="text-[10px] text-flame-400 animate-pulse font-medium">Loading AI model…</span>
            )}
            {segReady && (
              <span className="text-[10px] text-green-400 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
                AI Ready
              </span>
            )}
          </div>

          {/* None + Blur options */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {BACKGROUND_OPTIONS.filter(o => o.type === 'none' || o.type === 'blur' || o.type === 'blur-strong').map(opt => (
              <button
                key={opt.id}
                onClick={() => onSelect(opt)}
                className={[
                  'relative rounded-xl border-2 aspect-video flex flex-col items-center justify-center gap-1 transition-all text-xs font-semibold',
                  selected.id === opt.id
                    ? 'border-flame-500 bg-flame-500/15 text-flame-400'
                    : 'border-white/10 bg-white/[0.04] text-white/60 hover:border-white/25',
                ].join(' ')}
              >
                <span className="text-xl">{opt.emoji}</span>
                <span>{opt.label}</span>
                {selected.id === opt.id && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-flame-500 flex items-center justify-center">
                    <Check size={9} className="text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Image backgrounds grid */}
          <div className="grid grid-cols-2 gap-2">
            {BACKGROUND_OPTIONS.filter(o => o.type === 'image').map(opt => (
              <button
                key={opt.id}
                onClick={() => onSelect(opt)}
                className={[
                  'relative rounded-xl overflow-hidden aspect-video border-2 transition-all',
                  selected.id === opt.id
                    ? 'border-flame-500 shadow-flame-sm'
                    : 'border-white/10 hover:border-white/30',
                ].join(' ')}
              >
                <img
                  src={opt.thumb}
                  alt={opt.label}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  crossOrigin="anonymous"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1">
                  <span className="text-[10px] font-semibold text-white">{opt.label}</span>
                </div>
                {selected.id === opt.id && (
                  <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-flame-500 flex items-center justify-center shadow-lg">
                    <Check size={10} className="text-white" />
                  </div>
                )}
              </button>
            ))}

            {/* Custom upload tile */}
            <button
              onClick={() => fileRef.current?.click()}
              className={[
                'relative rounded-xl aspect-video border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all',
                selected.id === 'custom'
                  ? 'border-flame-500 bg-flame-500/10'
                  : 'border-white/15 hover:border-white/30 bg-white/[0.03]',
              ].join(' ')}
            >
              {selected.id === 'custom' && selected.thumb ? (
                <>
                  <img src={selected.thumb} alt="Custom" className="absolute inset-0 w-full h-full object-cover rounded-xl opacity-70" />
                  <div className="relative z-10 text-[10px] font-bold text-white bg-black/50 px-2 py-0.5 rounded">Change</div>
                </>
              ) : (
                <>
                  <Upload size={18} className="text-white/40" />
                  <span className="text-[10px] text-white/40 font-semibold">Upload Photo</span>
                </>
              )}
            </button>
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

          {(selected.type !== 'none') && !segReady && !loading && (
            <p className="text-[10px] text-white/35 mt-2 leading-relaxed">
              💡 AI segmentation loading — background will apply once ready. You'll see a blur fallback until then.
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* ── Audio Settings ─────────────────────────────────── */}
        <div>
          <span className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-3">
            Audio Enhancement
          </span>

          {/* Noise cancellation toggle */}
          <div className="flex items-center justify-between py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-flame-500/15 flex items-center justify-center shrink-0">
                <Mic size={15} className="text-flame-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Noise Cancellation</p>
                <p className="text-[11px] text-white/40">Removes background noise & echo</p>
              </div>
            </div>
            <Toggle
              on={audioSettings.noiseCancel}
              onChange={v => onAudioChange({ noiseCancel: v })}
            />
          </div>

          {/* Voice focus toggle */}
          <div className="flex items-center justify-between py-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-accent/10 flex items-center justify-center shrink-0">
                <Volume2 size={15} className="text-cyan-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Voice Focus</p>
                <p className="text-[11px] text-white/40">Isolates speech frequencies (200–4500Hz)</p>
              </div>
            </div>
            <Toggle
              on={audioSettings.voiceFocus}
              onChange={v => onAudioChange({ voiceFocus: v })}
              disabled={!audioSettings.noiseCancel}
            />
          </div>

          {/* Mic volume */}
          <div className="py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-white">Mic Volume</p>
              <span className="text-xs font-mono text-flame-400">{Math.round(audioSettings.gain * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={200} step={5}
              value={Math.round(audioSettings.gain * 100)}
              onChange={e => onAudioChange({ gain: Number(e.target.value) / 100 })}
              className="w-full accent-flame-500"
            />
            <div className="flex justify-between text-[10px] text-white/30 mt-1">
              <span>0%</span><span>100%</span><span>200%</span>
            </div>
          </div>

          <div className="bg-white/[0.04] rounded-xl p-3 text-[11px] text-white/40 leading-relaxed">
            🎙️ Browser-level echo cancellation & noise suppression are always active.
            These controls add an extra layer of Web Audio API processing on top.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────
function Toggle({ on, onChange, disabled = false }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      className={[
        'relative w-11 h-6 rounded-full transition-all duration-200 shrink-0',
        disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer',
        on ? 'bg-flame-500' : 'bg-white/10',
      ].join(' ')}
      aria-label="toggle"
    >
      <span className={[
        'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200',
        on ? 'left-6' : 'left-1',
      ].join(' ')} />
    </button>
  );
}
