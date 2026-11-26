import { useEffect, useMemo, useRef, useState } from 'react';
import { audioEngine } from '../audio/AudioEngine';
import { useStore } from '../store';
import { wrapLine } from '../utils/text';
import { cueDialectText } from '../utils/subtitles';
import type { AlignmentResult, Show } from '../types/domain';

export function PreviewStage({ show, result }: { show: Show; result: AlignmentResult }) {
  const maxChars = useStore((s) => s.maxChars);
  const bilingual = useStore((s) => s.bilingual);
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [gapLabel, setGapLabel] = useState<string | null>(null);
  const idRef = useRef({ cue: '', gap: '' });

  const lineById = useMemo(() => new Map(show.script.map((l) => [l.id, l])), [show.script]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = audioEngine.currentTime;
      const cue = result.cue.find((c) => t >= c.start && t <= c.end);
      const gap = result.gaps.find((g) => t >= g.start && t <= g.end);
      const cueId = cue?.id ?? '';
      const gapKey = gap ? gap.id : '';
      if (cueId !== idRef.current.cue) {
        idRef.current.cue = cueId;
        setActiveCueId(cue?.id ?? null);
      }
      const gl = gap ? gap.label : null;
      if (gapKey !== idRef.current.gap) {
        idRef.current.gap = gapKey;
        setGapLabel(gl);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result]);

  const cue = result.cue.find((c) => c.id === activeCueId) ?? null;
  const line = cue?.lineId ? lineById.get(cue.lineId) : undefined;
  const dialectLines = cue ? wrapLine(cueDialectText(cue, line), maxChars) : [];
  const manLines = cue && bilingual && cue.mandarin ? wrapLine(cue.mandarin, maxChars + 6) : [];

  return (
    <div className="stage">
      <ShadowScene />
      {gapLabel && !cue && <div className="gap-banner">♪ {gapLabel} ♪</div>}
      <div className="sub-overlay">
        {cue && !gapLabel && (
          <>
            <span className="sub-dialect">
              {dialectLines.map((l, i) => (
                <span className="line" key={i}>
                  {l}
                </span>
              ))}
            </span>
            {manLines.map((l, i) => (
              <span className="sub-man" key={`m${i}`}>
                {l}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** 皮影戏幕布 + 轻摆的皮影人（纯 SVG/CSS） */
function ShadowScene() {
  return (
    <div className="stage-screen" aria-hidden>
      <div
        style={{
          position: 'absolute',
          inset: '6% 8%',
          borderRadius: 8,
          background: 'radial-gradient(60% 70% at 50% 42%, rgba(255,214,150,0.95), rgba(214,150,74,0.55) 55%, rgba(120,70,26,0.2) 100%)',
          boxShadow: 'inset 0 0 60px rgba(90,50,15,0.55), 0 0 40px rgba(255,190,110,0.18)',
        }}
      />
      <svg
        viewBox="0 0 200 240"
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '10%',
          height: '78%',
          transform: 'translateX(-50%)',
          filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.45))',
          opacity: 0.92,
        }}
      >
        <g className="puppet-sway" style={{ transformOrigin: '100px 220px' }}>
          {/* 帽饰 */}
          <path d="M100 18 L112 40 L88 40 Z" fill="#3a0f0c" />
          <circle cx="100" cy="46" r="15" fill="#2a0b08" />
          {/* 上身 */}
          <path d="M78 66 Q100 56 122 66 L130 140 Q100 152 70 140 Z" fill="#5a1712" />
          <path d="M100 60 L100 148" stroke="#c79a3f" strokeWidth="2" />
          <circle cx="100" cy="92" r="4" fill="#e0b257" />
          <circle cx="100" cy="112" r="4" fill="#e0b257" />
          {/* 手臂 */}
          <g className="puppet-arm-l" style={{ transformOrigin: '80px 72px' }}>
            <path d="M80 72 L52 108 L58 114 L88 82 Z" fill="#4a130f" />
          </g>
          <g className="puppet-arm-r" style={{ transformOrigin: '120px 72px' }}>
            <path d="M120 72 L150 104 L144 111 L112 82 Z" fill="#4a130f" />
          </g>
          {/* 腿 */}
          <rect x="86" y="142" width="11" height="66" rx="5" fill="#2a0b08" />
          <rect x="103" y="142" width="11" height="66" rx="5" fill="#2a0b08" />
          {/* 操纵杆 */}
          <line x1="55" y1="110" x2="40" y2="232" stroke="rgba(40,20,8,0.6)" strokeWidth="2" />
          <line x1="147" y1="106" x2="162" y2="232" stroke="rgba(40,20,8,0.6)" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}
