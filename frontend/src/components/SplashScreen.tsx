import React, { useEffect, useState } from "react";
import BatuaLogoReveal from "./BatuaLogoReveal";

interface SplashScreenProps {
  onHide?: () => void;
}

// Total on-screen time for the full choreography: the arrow (1.7s delay +
// 0.6s) finishes at ~2.3s, the snap pulse lands ~2.55s, the tagline at 2.5s +
// 0.5s. Start the exit once the mark is assembled.
const FULL_MS = 2700;
// Repeat visitors: skip the story, just flash the assembled mark.
const QUICK_MS = 600;
// Must stay in sync with the .batua-stage transition duration in CSS.
const EXIT_MS = 450;

export default function SplashScreen({ onHide }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [firstRun, setFirstRun] = useState<boolean | null>(null);

  useEffect(() => {
    // Prevent scrolling during splash screen
    document.body.style.overflow = 'hidden';

    let isFirstRun = true;
    try {
      const seen = localStorage.getItem("batua-splash-seen");
      isFirstRun = !seen;
      if (!seen) {
        localStorage.setItem("batua-splash-seen", "true");
      }
    } catch {
      // localStorage unavailable - don't block splash, treat as first run
    }
    setFirstRun(isFirstRun);

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
      const hold = isFirstRun ? FULL_MS : QUICK_MS;
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
  }, []);

  if (!visible) return null;

  return (
    <BatuaLogoReveal
      leaving={leaving}
      waiting={waiting}
      tagline={true}
      firstRunKnown={firstRun}
    />
  );
}
