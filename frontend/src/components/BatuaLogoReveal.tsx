import React from "react";
import { useTheme } from "@/App";
import "./BatuaLogoReveal.css";
import batuaLogoDark from "/b_logo_dark.svg";
import batuaLogoLight from "/b_logo_light.svg";

export default function BatuaLogoReveal() {
  const { theme } = useTheme();
  const batuaLogo = theme === "dark" ? batuaLogoDark : batuaLogoLight;

  return (
    <div className="batua-stage">
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
        <div className="batua-logo-wrap">

          {/* Soft outer aura */}
          <div className="logo-aura" />

          {/* Actual Batua logo */}
          <img
            src={batuaLogo}
            alt="Batua"
            className="batua-logo"
          />

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
