import React, { useEffect, useState } from "react";
import logo from "/logo.svg";

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hide splash screen after 2.5 seconds
    const timer = setTimeout(() => {
      setVisible(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background">
      <div className="flex items-center gap-8">
        {/* Logo */}
        <div className="relative">
          <img 
            src={logo} 
            alt="Batua Logo" 
            className="w-24 h-24"
          />
          {/* Animated glow */}
          <div className="absolute inset-0 -m-2">
            <div className="w-full h-full rounded-full bg-primary/20 blur-xl animate-pulse" style={{ animationDuration: '2s' }} />
          </div>
        </div>

        {/* Brand name */}
        <div className="space-y-1">
          <h1 className="text-5xl font-bold tracking-tight">Batua</h1>
          <p className="text-sm text-muted-foreground">Your Personal Finance Manager</p>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center gap-2 ml-4">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
