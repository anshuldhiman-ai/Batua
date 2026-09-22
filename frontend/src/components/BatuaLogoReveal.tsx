import React, { useState } from "react";
import Logo from "@/components/Logo";
import "./BatuaLogoReveal.css";

interface BatuaLogoRevealProps {
  leaving?: boolean;
  waiting?: boolean;
  tagline?: boolean;
  /** When provided, avoids localStorage reads and ensures the first-render
   *  animation timing matches the splash screen choreography. */
  firstRunKnown?: boolean | null;
}

export default function BatuaLogoReveal({
  leaving,
  waiting,
  tagline,
  firstRunKnown,
}: BatuaLogoRevealProps) {
  const [firstRun] = useState<boolean>(() => {
    if (firstRunKnown !== undefined && firstRunKnown !== null) {
      return firstRunKnown;
    }

    try {
      const seen = localStorage.getItem("batua-splash-seen");
      return !seen;
    } catch {
      // localStorage unavailable - treat as first run
      return true;
    }
  });

  const isQuick = !firstRun;

  return (
    <div
      className={`batua-stage ${leaving ? "is-leaving" : ""} ${
        isQuick ? "is-quick" : ""
      }`}
    >
      <div className="batua-scene">
        {/* Main logo */}
        <div className="batua-mark">
          <Logo className="mark-glyph" />
        </div>

        {/* Tagline - first run only */}
        {tagline && firstRun && <p className="batua-tagline">Your Money Matters</p>}

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
