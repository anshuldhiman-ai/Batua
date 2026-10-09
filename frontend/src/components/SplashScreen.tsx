import React, { useEffect, useState } from "react";
import BatuaLogoReveal from "./BatuaLogoReveal";

interface SplashScreenProps {
  onHide?: () => void;
  /**
   * Hold the splash open until this flips false — e.g. until the
   * app's first data has loaded, so the logo covers the initial
   * fetch instead of an empty page. The leave choreography still
   * runs once released.
   */
  hold?: boolean;
}

// Total on-screen time for the full choreography: arrow finishes at ~1.6s
const FULL_MS = 2000;
// Repeat visitors: skip the story, just flash the assembled mark.
const QUICK_MS = 500;
// Must stay in sync with the .batua-stage transition duration in CSS.
const EXIT_MS = 450;

export default function SplashScreen({ onHide, hold }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [waiting, setWaiting] = useState(true);
  // True while we're still waiting for the hold to release.
  const [held, setHeld] = useState(!!hold);

  // Determine first/returning visitor *before* the first paint so we don't
  // briefly play the wrong animation (which can feel glitchy).
  const [firstRun] = useState<boolean>(() => {
    try {
      const seen = localStorage.getItem("batua-splash-seen");
      const isFirst = !seen;
      if (!seen) {
        localStorage.setItem("batua-splash-seen", "true");
      }
      return isFirst;
    } catch {
      // localStorage unavailable - treat as first run
      return true;
    }
  });

  useEffect(() => {
    if (hold) {
      // Held open — stay put until the caller releases us.
      setHeld(true);
      return;
    }
    if (!held) return;
    // Just released: fall through to the normal choreography below
    // by clearing the held flag first, then dismissing on the timer.
    setHeld(false);
  }, [hold, held]);

  useEffect(() => {
    if (held) return;

    // Prevent scrolling during splash screen
    document.body.style.overflow = 'hidden';

    // Gate splash screen on document.fonts.ready
    const run = async () => {
      try {
        await document.fonts.ready;
      } catch {
        // fonts.ready failed - proceed anyway
      }
      setWaiting(false);

      // Allow the animation to complete before leaving. Repeat visitors get
      // the quick flash instead of the full story.
      const hold = firstRun ? FULL_MS : QUICK_MS;
      const timer = setTimeout(() => {
        setLeaving(true);
        setTimeout(() => {
          setVisible(false);
          document.body.style.overflow = '';
          onHide?.();
        }, EXIT_MS);
      }, hold);

      return () => clearTimeout(timer);
    };

    run();

    // Cleanup: restore scrolling if component unmounts
    return () => {
      document.body.style.overflow = '';
    };
    // The choreography runs once the hold is released; firstRun is fixed
    // for the component's lifetime, so it doesn't need to re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, firstRun]);

  if (!visible) return null;

  return (
    <BatuaLogoReveal
      leaving={leaving}
      waiting={waiting}
      firstRunKnown={firstRun}
    />
  );
}
