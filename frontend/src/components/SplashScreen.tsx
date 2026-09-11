import React, { useEffect, useState } from "react";

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
      <div className="flex flex-col items-center gap-6">
        {/* Logo/Brand */}
        <div className="relative">
          <div className="flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-2xl">
            <span className="text-4xl font-bold text-primary-foreground">B</span>
          </div>
          {/* Animated rings */}
          <div className="absolute inset-0 -m-4">
            <div className="w-full h-full rounded-full border-2 border-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
          </div>
          <div className="absolute inset-0 -m-8">
            <div className="w-full h-full rounded-full border border-primary/10 animate-ping" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
          </div>
        </div>

        {/* Brand name */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Batua</h1>
          <p className="text-sm text-muted-foreground">Your Personal Finance Manager</p>
        </div>

        {/* Loading indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}
