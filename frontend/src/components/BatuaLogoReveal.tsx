import React, { useState, useEffect } from "react";
import Logo from "@/components/Logo";
import "./BatuaLogoReveal.css";

interface BatuaLogoRevealProps {
  leaving?: boolean;
  waiting?: boolean;
  tagline?: boolean;
  /** null = not yet determined (localStorage read pending). When false, the
   *  full choreography is skipped and the assembled mark is shown statically. */
  firstRunKnown?: boolean | null;
}

export default function BatuaLogoReveal({
  leaving,
  waiting,
  tagline,
  firstRunKnown,
}: BatuaLogoRevealProps) {
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    // The localStorage read lives in SplashScreen now; keep this for any
    // standalone usages of the reveal (e.g. tests, future in-app replay).
    if (firstRunKnown !== undefined && firstRunKnown !== null) {
      setFirstRun(firstRunKnown);
      return;
    }
    try {
      const seen = localStorage.getItem("batua-splash-seen");
      setFirstRun(!seen);
      if (!seen) {
        localStorage.setItem("batua-splash-seen", "true");
      }
    } catch {
      // localStorage unavailable - don't block splash
    }
  }, [firstRunKnown]);

  const isQuick = firstRunKnown === false;

  return (
    <div className={`batua-stage ${leaving ? "is-leaving" : ""} ${isQuick ? "is-quick" : ""}`}>
      <div className="batua-scene">

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
