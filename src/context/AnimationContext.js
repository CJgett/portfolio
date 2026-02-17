"use client";
import { createContext, useContext, useState, useCallback } from "react";

const AnimationContext = createContext();

export function AnimationProvider({ children }) {
  const [globalPlaying, setGlobalPlaying] = useState(true);

  const toggleGlobal = useCallback(() => {
    setGlobalPlaying((prev) => !prev);
  }, []);

  return (
    <AnimationContext.Provider value={{ globalPlaying, toggleGlobal }}>
      {children}
    </AnimationContext.Provider>
  );
}

export function useAnimation() {
  return useContext(AnimationContext);
}
