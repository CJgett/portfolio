"use client";
import { createContext, useContext, useState, useCallback } from "react";

const AnimationContext = createContext();

export function AnimationProvider({ children }) {
  const [globalPlaying, setGlobalPlaying] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleGlobal = useCallback(() => {
    setGlobalPlaying((prev) => !prev);
  }, []);

  return (
    <AnimationContext.Provider value={{ globalPlaying, setGlobalPlaying, toggleGlobal, isFullscreen, setIsFullscreen }}>
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimation() {
  return useContext(AnimationContext);
}
