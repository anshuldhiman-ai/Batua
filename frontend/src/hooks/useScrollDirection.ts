import { useEffect, useState } from "react";

interface ScrollDirectionOptions {
  threshold?: number;
  topOffset?: number;
}

/**
 * Tracks window scroll velocity and direction to dynamically hide controls
 * when scrolling down and smoothly reveal them when scrolling up.
 */
export function useScrollDirection({
  threshold = 12,
  topOffset = 50,
}: ScrollDirectionOptions = {}) {
  const [isVisible, setIsVisible] = useState(true);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    let ticking = false;

    const updateScrollDirection = () => {
      const currentScrollY = window.scrollY;
      setScrollY(currentScrollY);

      // Always visible at the very top of the page
      if (currentScrollY <= topOffset) {
        setIsVisible(true);
        lastScrollY = currentScrollY;
        ticking = false;
        return;
      }

      const diff = currentScrollY - lastScrollY;

      // Only toggle if scroll delta exceeds threshold
      if (Math.abs(diff) >= threshold) {
        if (diff > 0) {
          // Scrolling down
          setIsVisible(false);
        } else {
          // Scrolling up
          setIsVisible(true);
        }
        lastScrollY = currentScrollY;
      }

      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScrollDirection);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold, topOffset]);

  return { isVisible, scrollY };
}
