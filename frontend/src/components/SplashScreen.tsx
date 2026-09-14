import React, { useEffect, useState } from "react";
import BatuaLogoReveal from "./BatuaLogoReveal";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    // Gate splash screen on document.fonts.ready
    const checkFonts = async () => {
      try {
        await document.fonts.ready;
        setWaiting(false);
        
        // Allow animation to complete before leaving
        // Animation sequence: B (0.1s delay + 0.6s) + rupee (0.7s delay + 0.4s) + clasp (1.1s delay + 0.35s) + arrow (1.45s delay + 0.7s)
        // Total ~2.15s for last part to complete, start leaving after 2.5s for smooth exit
        const timer = setTimeout(() => {
          setLeaving(true);
          setTimeout(() => {
            setVisible(false);
          }, 450); // Match CSS transition duration
        }, 2500);

        return () => clearTimeout(timer);
      } catch {
        // Fallback if fonts.ready fails
        setWaiting(false);
        const timer = setTimeout(() => {
          setLeaving(true);
          setTimeout(() => {
            setVisible(false);
          }, 450);
        }, 2500);
        return () => clearTimeout(timer);
      }
    };

    checkFonts();
  }, []);

  if (!visible) return null;

  return <BatuaLogoReveal leaving={leaving} waiting={waiting} tagline={true} />;
}
