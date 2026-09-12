import React, { useEffect, useState } from "react";
import BatuaLogoReveal from "./BatuaLogoReveal";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hide splash screen after 3.5 seconds for full animation
    const timer = setTimeout(() => {
      setVisible(false);
    }, 3500);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return <BatuaLogoReveal />;
}
