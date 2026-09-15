import React, { useState, useEffect } from "react";
import "./BatuaLogoReveal.css";

interface Props { leaving?: boolean; waiting?: boolean; tagline?: boolean; }

export default function BatuaLogoReveal({ leaving, waiting, tagline }: Props) {
  const [firstRun, setFirstRun] = useState(false);
  useEffect(() => { try { const s = localStorage.getItem("batua-splash-seen"); setFirstRun(!s); if (!s) localStorage.setItem("batua-splash-seen", "true"); } catch {} }, []);

  return (
    <div className={`batua-stage ${leaving ? "is-leaving" : ""}`}>
      <div className="batua-scene">
        {/* B frame (drawn by perimeter) + inner content */}
        <svg viewBox="0 0 400 400" width="100%" height="100%" style={{maxWidth:380, maxHeight:380}} preserveAspectRatio="xMidYMid meet">
          <rect width="400" height="400" fill="#0a0a0b" />

          {/* Perimeter: B outline */}
          <path class="perimeter" d="M 70,50 L 70,350 Q 70,390 110,390 L 260,390 Q 300,390 300,350 L 300,50 Q 300,10 260,10 L 140,10 Q 70,10 70,50 Z M 110,90 L 240,90 Q 270,90 270,130 L 270,150 Q 270,190 240,190 L 110,190 Q 80,190 80,150 L 80,130 Q 80,90 110,90 Z M 110,230 L 270,230 Q 300,230 300,270 L 300,290 Q 300,330 270,330 L 110,330 Q 80,330 80,290 L 80,270 Q 80,230 110,230 Z"
            fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Rupee */}
          <text x="200" y="320" fontFamily="serif" fontSize="48" fontWeight="bold" fill="#c0c0c0" textAnchor="middle">₹</text>

          {/* Edge lines between 3 clasp points */}
          <line x1="140" y1="210" x2="200" y2="140" stroke="#00ffd5" strokeWidth="3" />
          <line x1="200" y1="140" x2="260" y2="210" stroke="#00ffd5" strokeWidth="3" />
          <line x1="260" y1="210" x2="140" y2="210" stroke="#00ffd5" strokeWidth="3" />

          {/* 3 clasp circles (nodes) */}
          <circle cx="140" cy="210" r="7" fill="#00ffd5" />
          <circle cx="200" cy="140" r="7" fill="#00ffd5" />
          <circle cx="260" cy="210" r="7" fill="#00ffd5" />

          {/* Arrow shooting out */}
          <polygon points="200,140 185,170 215,170" fill="#ffffff" />
        </svg>

        {tagline && firstRun && <p className="batua-tagline">Your Money Matters</p>}
        {waiting && <div className="batua-progress is-visible"><span /></div>}
      </div>
    </div>
  );
}
