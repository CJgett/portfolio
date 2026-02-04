"use client";
import React, { useRef, useEffect } from 'react';

function WasmBackground() {
  const canvasRef = useRef(null);
  const wasmRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
  
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
  
      const handleResize = () => {
        canvas.width = window.innerWidth - 2;
        canvas.height = window.innerHeight;
      };
  
      const loadWasm = async () => {
        try {
         const imports = {
            env: {
              abort: () => console.log("Abort!"),
              // We map the AS 'log' function to the JS 'console.log'
              log: (val) => console.log("WASM Log:", val)
            }
          };
          const response = await fetch("/optimized.wasm");
          const module = await WebAssembly.instantiateStreaming(response, imports);
          
          wasmRef.current = module.instance.exports;
          
          window.addEventListener('resize', handleResize);
          handleResize(); // Set initial size
  
          requestRef.current = requestAnimationFrame(animate);
        } catch (err) {
          console.error("Failed", err);
        }
      };
  
      loadWasm();
  
      return () => {
        cancelAnimationFrame(requestRef.current);
        window.removeEventListener('resize', handleResize);
      };
    }, []);

  const lastTimeRef = useRef(0);
  
    const animate = (time) => {
      const wasm = wasmRef.current;
      const canvas = canvasRef.current;
      
      if (wasm && canvas) {
        const deltaTime = time - lastTimeRef.current;
        lastTimeRef.current = time;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const buffer = wasm.memory.buffer;
        const requiredBytes = width * height * 4;
        const requiredPages = Math.ceil(requiredBytes / (64 * 1024));
        const currentPages = buffer.byteLength / (64 * 1024);

        if (requiredPages > currentPages) {
          console.log(`Growing memory by ${requiredPages - currentPages} pages.`);
          wasm.memory.grow(requiredPages - currentPages);
        }

        const pixelData = new Uint8ClampedArray(wasm.memory.buffer, 0, requiredBytes);

        // 'time' is a large float, we cast to integer for the "tick"
        wasm.update(Math.floor(time / 10), width, height);
          
        // Draw to canvas
        // Note: We create a new ImageData every frame because 
        // the raw buffer might detach if memory grows (though we aren't growing it here)
        const imageData = new ImageData(pixelData, width, height);
        ctx.putImageData(imageData, 0, 0);


        // --- START OSD OVERLAY ---
        // 1. Set text styles
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // Semi-transparent background
        ctx.fillRect(5, 5, 120, 45);          // Background box for readability

        ctx.font = "12px monospace";
        ctx.fillStyle = "#00FF00";            // Classic "Matrix" green

        // 2. Calculate data
        const fps = (lastTimeRef.current > 0 && deltaTime > 0) 
          ? (1000 / deltaTime).toFixed(1) 
          : "0.0";
        lastTimeRef.current = time;

        // 3. Draw labels
        ctx.fillText(`FPS: ${fps}`, 10, 20);
        ctx.fillText(`TIME: ${Math.floor(time)}`, 10, 35);
        // ctx.fillText(`VAL: ${wasm.yourValue.value}`, 10, 50); // Example WASM value
        // --- END OSD OVERLAY ---
      }
      
      requestRef.current = requestAnimationFrame(animate);
    };
  return <canvas className="wasm-background-canvas" ref={canvasRef} style={{border: "1px solid white", imageRendering: "pixelated"}} />;
}

export default WasmBackground;
