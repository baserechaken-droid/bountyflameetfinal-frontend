import { useRef, useEffect, useState } from 'react';
import { Mic, MicOff, Camera, CameraOff } from 'lucide-react';

interface SelfPiPProps {
  stream: MediaStream | null;
  name: string;
  micOn: boolean;
  cameraOn: boolean;
}

export function SelfPiP({ stream, name, micOn, cameraOn }: SelfPiPProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 16, y: 80 }); // from bottom-right
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    const rect = containerRef.current!.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const el = containerRef.current!;
      const w = el.offsetWidth, h = el.offsetHeight;
      const newX = Math.max(8, Math.min(vw - w - 8, e.clientX - dragOffset.current.x));
      const newY = Math.max(8, Math.min(vh - h - 80, e.clientY - dragOffset.current.y));
      setPos({ x: newX, y: newY });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div
      ref={containerRef}
      className="fixed z-30 cursor-grab active:cursor-grabbing select-none"
      style={{ left: pos.x, top: pos.y, width: 160, aspectRatio: '16/9' }}
      onMouseDown={onMouseDown}
    >
      <div className="relative w-full h-full rounded-xl overflow-hidden border-2 border-flame-500/60 shadow-flame">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${cameraOn ? '' : 'opacity-0'}`}
          style={{ transform: 'scaleX(-1)' }}
        />
        {!cameraOn && (
          <div className="absolute inset-0 bg-dark-700 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-flame-500/20 flex items-center justify-center text-sm font-bold text-white">
              {initials}
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between">
          <span className="text-[9px] font-semibold text-white/80">You</span>
          <div className="flex gap-1">
            {micOn ? <Mic size={9} className="text-green-400" /> : <MicOff size={9} className="text-red-400" />}
            {cameraOn ? <Camera size={9} className="text-green-400" /> : <CameraOff size={9} className="text-red-400" />}
          </div>
        </div>
        <div className="absolute top-1 left-1 bg-flame-500/80 text-white text-[7px] font-black px-1.5 py-0.5 rounded tracking-widest">
          YOU
        </div>
      </div>
    </div>
  );
}
