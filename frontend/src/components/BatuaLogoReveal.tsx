import React from "react";
import { useTheme } from "@/App";
import "./BatuaLogoReveal.css";
import AnimatedLogo from "./AnimatedLogo";

interface BatuaLogoRevealProps {
  leaving?: boolean;
  waiting?: boolean;
  tagline?: boolean;
}

export default function BatuaLogoReveal({ leaving }: BatuaLogoRevealProps) {
  const { theme } = useTheme();

  return (
    <div className={`batua-stage ${leaving ? "leaving" : ""}`}>
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

        {/* Main logo with sequential animation */}
        <div className="batua-logo-wrap">

          {/* Soft outer aura */}
          <div className="logo-aura" />

          {/* Animated Batua logo */}
          <AnimatedLogo />

          {/* Moving border light */}
          <div className="edge-light">
            <div className="light-head" />
          </div>

          {/* Secondary soft trail */}
          <div className="edge-light edge-light-trail">
            <div className="light-head" />
          </div>

        </div>

      </div>
    </div>
  );
}
