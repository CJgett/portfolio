"use client";
import React, { useRef, useEffect } from 'react';

function WasmBackground() {
  const canvasRef = useRef(null);
  const wasmRef = useRef(null);
  const requestRef = useRef(null);

  const colorPalette = ["c78283","f3d9dc","d7bea8","b49286","744253"];
  const overlap = 10;
  const radius = 20;
  const sizeVariance = 10;

  useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
  
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
  
      const handleResize = () => {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
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
          
          initBG();
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
    const frameHistoryRef = useRef(new Array(100).fill(0));
    let canvas;
    let ctx;
    let brushStroke;

    function initBG() {
      canvas = canvasRef.current;
      ctx = canvas.getContext('2d');
      ctx.globalAlpha = 0.9;
      brushStroke = new BrushStroke("#" + colorPalette[Math.ceil(Math.random() * colorPalette.length)], radius);
      const width = canvas.width;
      const height = canvas.height;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr); // This makes all your drawing commands work normally
    }

    function BrushStroke(color, radius) {
      this.color = color;
      this.radius = radius; 
    }

    let frame = 0;

    const animate = (time) => {
      const wasm = wasmRef.current;
      frame++;
      
      if (wasm && canvas) {
        const deltaTime = time - lastTimeRef.current;
          lastTimeRef.current = time;
          const width = canvas.width;
          const height = canvas.height;

        if (frame % 20 == 0) {
          const dpr = window.devicePixelRatio || 1;
          const x = Math.ceil(Math.random() * (width / dpr));
          const y = Math.ceil(Math.random() * (height / dpr));
          const newColor = "#" + colorPalette[Math.ceil(Math.random() * colorPalette.length)];

          ctx.beginPath();
          ctx.arc(x, y, brushStroke.radius, 0, 2 * Math.PI);
          ctx.fillStyle = newColor;
          ctx.fill();
        }

        ctx.fillStyle = "rgb(256 256 256 / .03)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        /*

        const buffer = wasm.memory.buffer;
        const requiredBytes = width * height * 4;
        const requiredPages = Math.ceil(requiredBytes / (64 * 1024));
        const currentPages = buffer.byteLength / (64 * 1024);

        if (requiredPages > currentPages) {
          console.log(`Growing memory by ${requiredPages - currentPages} pages.`);
          wasm.memory.grow(requiredPages - currentPages);
        }

        const pixelData = new Uint8ClampedArray(wasm.memory.buffer, 0, requiredBytes);

*/
        /*
        // 'time' is a large float, we cast to integer for the "tick"
        wasm.update(Math.floor(time / 10), width, height);
          
        // Draw to canvas
        // Note: We create a new ImageData every frame because 
        // the raw buffer might detach if memory grows (though we aren't growing it here)
        const imageData = new ImageData(pixelData, width, height);
        ctx.putImageData(imageData, 0, 0);
        */

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
        // Draw FPS Graph 
        frameHistoryRef.current.push(deltaTime);
        frameHistoryRef.current.shift(); // Remove the oldest entry

        const graphX = 5;
        const graphY = 60; // Position below your text
        const graphHeight = 30;

        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(graphX, graphY, 100, graphHeight);

        ctx.strokeStyle = "#00FF00";
        ctx.beginPath();
        frameHistoryRef.current.forEach((d, i) => {
          // Map deltaTime to height. 
          // 16.6ms (60fps) will be middle-ish. Spikes will go higher.
          const h = Math.min(graphHeight, (d / 33) * graphHeight); 
          ctx.moveTo(graphX + i, graphY + graphHeight);
          ctx.lineTo(graphX + i, graphY + graphHeight - h);
        });
        ctx.stroke();

        // 4. Draw a "Target" line for 60fps (16.6ms)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath();
        ctx.moveTo(graphX, graphY + (graphHeight / 2));
        ctx.lineTo(graphX + 100, graphY + (graphHeight / 2));
        ctx.stroke();
      }
      
      requestRef.current = requestAnimationFrame(animate);
    };
  return <canvas className="wasm-background-canvas" ref={canvasRef}  />;
}

export default WasmBackground;
