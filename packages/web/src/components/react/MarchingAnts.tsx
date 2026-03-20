import { type ReactNode, useEffect, useRef } from "react";

interface MarchingAntsProps {
  children: ReactNode;
  className?: string;
}

export default function MarchingAnts({ children, className = "" }: MarchingAntsProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rectRef = useRef<SVGRectElement>(null);
  const inset = 10;

  useEffect(() => {
    const updateSize = () => {
      const svg = svgRef.current;
      const rect = rectRef.current;
      if (!svg || !rect) return;
      const { width, height } = svg.getBoundingClientRect();
      rect.setAttribute("x", String(inset));
      rect.setAttribute("y", String(inset));
      rect.setAttribute("width", String(Math.max(width - inset * 2, 0)));
      rect.setAttribute("height", String(Math.max(height - inset * 2, 0)));
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    if (svgRef.current) observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`relative ${className}`}>
      <svg
        ref={svgRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          overflow: "visible",
        }}
      >
        <rect
          ref={rectRef}
          fill="none"
          stroke="#080708"
          strokeWidth="3"
          strokeDasharray="16 8"
          style={{ animation: "march 1.2s linear infinite" }}
        />
      </svg>
      {children}
    </div>
  );
}
