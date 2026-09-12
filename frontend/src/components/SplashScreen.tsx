import React, { useEffect, useState } from "react";
import { useTheme } from "@/App";
import logoDark from "/b_logo_dark.svg";
import logoLight from "/b_logo_light.svg";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const { theme } = useTheme();

  useEffect(() => {
    // Hide splash screen after 3 seconds (longer for animation)
    const timer = setTimeout(() => {
      setVisible(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const logo = theme === "dark" ? logoDark : logoLight;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <div className="flex items-center gap-8">
        {/* Logo with animation */}
        <div className="relative">
          <div 
            className="w-24 h-24"
            style={{
              animation: 'cinematicZoom 3s cubic-bezier(0.25, 1, 0.5, 1) forwards',
            }}
          >
            <img 
              src={logo} 
              alt="Batua Logo" 
              className="w-full h-full"
              style={{
                animation: 'revealLogo 2s ease-in-out 0.5s forwards',
                opacity: 0,
              }}
            />
          </div>
          {/* Animated glow */}
          <div 
            className="absolute inset-0 -m-2 rounded-full blur-xl"
            style={{
              background: theme === "dark" 
                ? 'rgba(62, 194, 138, 0.3)' 
                : 'rgba(23, 107, 92, 0.2)',
              animation: 'glowPulse 2s ease-in-out 1s forwards',
              opacity: 0,
            }}
          />
        </div>

        {/* Brand name with animation */}
        <div className="space-y-1">
          <h1 
            className="text-5xl font-bold tracking-tight"
            style={{
              animation: 'fadeInSlide 1s ease-out 1.5s forwards',
              opacity: 0,
              transform: 'translateX(-20px)',
            }}
          >
            Batua
          </h1>
          <p 
            className="text-sm text-muted-foreground"
            style={{
              animation: 'fadeInSlide 1s ease-out 1.7s forwards',
              opacity: 0,
              transform: 'translateX(-20px)',
            }}
          >
            Your Personal Finance Manager
          </p>
        </div>

        {/* Loading indicator */}
        <div 
          className="flex items-center gap-2 ml-4"
          style={{
            animation: 'fadeIn 1s ease-out 2s forwards',
            opacity: 0,
          }}
        >
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>

      {/* Inline styles for animations */}
      <style>{`
        @keyframes cinematicZoom {
          from { transform: scale(0.95); }
          to { transform: scale(1); }
        }

        @keyframes revealLogo {
          from { 
            opacity: 0; 
            filter: blur(4px);
          }
          to { 
            opacity: 1; 
            filter: blur(0px);
          }
        }

        @keyframes glowPulse {
          from { 
            opacity: 0;
            transform: scale(0.8);
          }
          to { 
            opacity: 1;
            transform: scale(1.2);
          }
        }

        @keyframes fadeInSlide {
          from { 
            opacity: 0;
            transform: translateX(-20px);
          }
          to { 
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
