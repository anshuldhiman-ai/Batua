import React, { useState, useEffect } from "react";
import Logo from "@/components/Logo";
import "./BatuaLogoReveal.css";

interface BatuaLogoRevealProps {
  leaving?: boolean;
  waiting?: boolean;
  tagline?: boolean;
}

export default function BatuaLogoReveal({ leaving, waiting, tagline }: BatuaLogoRevealProps) {
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem("batua-splash-seen");
      setFirstRun(!seen);
      if (!seen) {
        localStorage.setItem("batua-splash-seen", "true");
      }
    } catch {
      // localStorage unavailable - don't block splash
    }
  }, []);

  return (
    <div className={`batua-stage ${leaving ? "is-leaving" : ""}`}>
      <div className="batua-scene">

        {/* Very subtle background atmosphere */}
        <div className="ambient-glow" />

        {/* Background finance panels */}
        <div className="finance-grid">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        {/* Main logo */}
        <div className="batua-mark">
          <Logo className="mark-glyph" />
        </div>

        {/* Tagline - first run only */}
        {tagline && firstRun && (
          <p className="batua-tagline">Your Money Matters</p>
        )}

        {/* Progress hairline - shown only when actually waiting */}
        {waiting && (
          <div className="batua-progress is-visible">
            <span />
          </div>
        )}

      </div>
    </div>
  );
}
