/**
 * useAudioProcessing — Web Audio API noise cancellation & voice focus
 *
 * Pipeline (when enabled):
 *   mic source
 *     → high-pass  80Hz   (remove AC hum, low rumble)
 *     → low-pass   8000Hz (remove high-freq hiss)
 *     → [voice focus bandpass 200–4500Hz, only when voiceFocus=true]
 *     → dynamics compressor (boost quieter words, tame loud sounds)
 *     → gain node
 *     → destination → new MediaStream with clean audio
 *
 * The browser's built-in noiseSuppression/echoCancellation run on the
 * raw mic track BEFORE this chain, so we get two layers of processing.
 */
import { useRef, useState, useCallback, useEffect } from 'react';

export interface AudioSettings {
  noiseCancel: boolean;
  voiceFocus:  boolean;
  gain:        number;   // 0.0 – 2.0, default 1.0
}

export function useAudioProcessing(rawStream: MediaStream | null) {
  const [settings, setSettings] = useState<AudioSettings>({
    noiseCancel: true,
    voiceFocus:  false,
    gain:        1.0,
  });
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(null);

  const ctxRef   = useRef<AudioContext | null>(null);
  const nodesRef = useRef<{
    source?:      MediaStreamAudioSourceNode;
    hiPass?:      BiquadFilterNode;
    loPass?:      BiquadFilterNode;
    voiceBand?:   BiquadFilterNode;
    compressor?:  DynamicsCompressorNode;
    gain?:        GainNode;
    dest?:        MediaStreamAudioDestinationNode;
  }>({});

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  // ── Build audio graph ────────────────────────────────────
  const buildGraph = useCallback((stream: MediaStream) => {
    // Close any previous context
    if (ctxRef.current) { ctxRef.current.close().catch(() => {}); }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setProcessedStream(stream);
      return;
    }

    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      const source     = ctx.createMediaStreamSource(stream);
      // High-pass: cut below 80Hz (removes AC hum, keyboard thumps)
      const hiPass     = ctx.createBiquadFilter();
      hiPass.type      = 'highpass';
      hiPass.frequency.value = 80;
      hiPass.Q.value   = 0.7;

      // Low-pass: cut above 8kHz (removes hiss, fan noise)
      const loPass     = ctx.createBiquadFilter();
      loPass.type      = 'lowpass';
      loPass.frequency.value = 8000;
      loPass.Q.value   = 0.7;

      // Voice focus bandpass: isolate human voice (200–4500Hz)
      const voiceBand  = ctx.createBiquadFilter();
      voiceBand.type   = 'bandpass';
      voiceBand.frequency.value = 1200; // center of speech
      voiceBand.Q.value = 0.5;

      // Compressor: makes quiet speech louder, loud sounds quieter
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -40;
      compressor.knee.value      = 20;
      compressor.ratio.value     = 6;
      compressor.attack.value    = 0.003;
      compressor.release.value   = 0.25;

      // Gain
      const gain       = ctx.createGain();
      gain.gain.value  = settingsRef.current.gain;

      // Destination → new audio stream
      const dest = ctx.createMediaStreamDestination();

      // Connect chain
      source.connect(hiPass);
      hiPass.connect(loPass);
      loPass.connect(compressor);
      compressor.connect(gain);
      gain.connect(dest);

      nodesRef.current = { source, hiPass, loPass, voiceBand, compressor, gain, dest };

      // Build final stream: processed audio + original video tracks
      const outStream = new MediaStream();
      dest.stream.getAudioTracks().forEach(t => outStream.addTrack(t));
      stream.getVideoTracks().forEach(t => outStream.addTrack(t));

      setProcessedStream(outStream);
      console.log('[Audio] Processing graph built');
    } catch (e) {
      console.warn('[Audio] AudioContext failed, using raw stream:', e);
      setProcessedStream(stream);
    }
  }, []);

  // ── Rebuild when raw stream changes ─────────────────────
  useEffect(() => {
    if (!rawStream) return;
    if (settings.noiseCancel) {
      buildGraph(rawStream);
    } else {
      setProcessedStream(rawStream);
    }
    return () => {
      ctxRef.current?.close().catch(() => {});
    };
  }, [rawStream, settings.noiseCancel, buildGraph]);

  // ── Apply voice focus on/off ─────────────────────────────
  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes.loPass || !nodes.compressor || !nodes.voiceBand) return;
    try {
      if (settings.voiceFocus) {
        // Insert bandpass between lo-pass and compressor
        nodes.loPass.disconnect();
        nodes.loPass.connect(nodes.voiceBand);
        nodes.voiceBand.connect(nodes.compressor);
      } else {
        nodes.voiceBand.disconnect();
        nodes.loPass.disconnect();
        nodes.loPass.connect(nodes.compressor);
      }
    } catch {}
  }, [settings.voiceFocus]);

  // ── Apply gain changes live ───────────────────────────────
  useEffect(() => {
    const g = nodesRef.current.gain;
    if (g) g.gain.setTargetAtTime(settings.gain, ctxRef.current!.currentTime, 0.1);
  }, [settings.gain]);

  const updateSettings = useCallback((patch: Partial<AudioSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  return {
    processedAudioStream: settings.noiseCancel ? processedStream : rawStream,
    audioSettings: settings,
    updateAudioSettings: updateSettings,
  };
}
