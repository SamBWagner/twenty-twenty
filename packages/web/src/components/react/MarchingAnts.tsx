import { type ReactNode, useEffect, useRef } from "react";

interface MarchingAntsProps {
  children: ReactNode;
  className?: string;
}

export default function MarchingAnts({ children, className = "" }: MarchingAntsProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rectRef = useRef<SVGRectElement>(null);

  useEffect(() => {
    const updateSize = () => {
      const svg = svgRef.current;
      const rect = rectRef.current;
      if (!svg || !rect) return;
      const { width, height } = svg.getBoundingClientRect();
      rect.setAttribute("width", String(width - 3));
      rect.setAttribute("height", String(height - 3));
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
          x="1.5"
          y="1.5"
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
