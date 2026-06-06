import { motion, useReducedMotion } from "framer-motion";
import { type LucideIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { ToonIcon, TOON_PALETTE } from "../ToonIcon";

const OUTLINE = "oklch(0.14 0.03 285)";

interface Stage {
  icon: LucideIcon;
  title: string;
}

interface Props {
  stages: Stage[];
  activeIndex: number;
  onSelect: (i: number) => void;
}

export function PacketRail({ stages, activeIndex, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [centers, setCenters] = useState<{ x: number; y: number }[]>([]);
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const measure = () => {
      const c = containerRef.current;
      if (!c) return;
      const crect = c.getBoundingClientRect();
      const next = nodeRefs.current.map((n) => {
        if (!n) return { x: 0, y: 0 };
        const r = n.getBoundingClientRect();
        return { x: r.left - crect.left + r.width / 2, y: r.top - crect.top + r.height / 2 };
      });
      setCenters(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [stages.length]);

  const target = centers[activeIndex];

  // Build a smooth path: straight along a row; when wrapping rows, drop into the
  // gap between rows with a smooth S-curve so the line never crosses any node.
  const pathD = (() => {
    if (!centers.length) return "";
    let d = `M${centers[0].x},${centers[0].y}`;
    for (let i = 1; i < centers.length; i++) {
      const a = centers[i - 1];
      const b = centers[i];
      const dy = b.y - a.y;
      if (Math.abs(dy) < 6) {
        d += ` L${b.x},${b.y}`;
      } else {
        // Row change — S-curve through the vertical gap between rows.
        // Control points sit on the mid-Y so the curve stays clear of nodes.
        const midY = (a.y + b.y) / 2;
        d += ` C${a.x},${midY} ${b.x},${midY} ${b.x},${b.y}`;
      }
    }
    return d;
  })();

  // Offset the packet above the active node so it doesn't cover it.
  const PACKET_OFFSET_Y = -44;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Rail path */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
        <motion.path
          d={pathD}
          stroke={OUTLINE}
          strokeWidth={2.5}
          strokeDasharray="6 6"
          fill="none"
          opacity={0.35}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
        />
      </svg>

      {/* Traveling packet — hovers above the active node */}
      {target && (
        <motion.div
          className="absolute z-20 pointer-events-none"
          initial={false}
          animate={{ x: target.x, y: target.y + PACKET_OFFSET_Y }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 120, damping: 18 }
          }
          style={{ translateX: "-50%", translateY: "-50%" }}
        >
          <div className="flex flex-col items-center">
            <div
              className="px-2 py-1 text-[11px] font-mono font-bold"
              style={{
                background: TOON_PALETTE[3],
                color: OUTLINE,
                border: `2.5px solid ${OUTLINE}`,
                borderRadius: 8,
                boxShadow: `3px 3px 0 0 ${OUTLINE}`,
              }}
            >
              {"{ }"}
            </div>
            {/* Pointer arrow */}
            <svg width="10" height="8" viewBox="0 0 10 8" className="-mt-[2px]">
              <path d="M0,0 L10,0 L5,8 Z" fill={TOON_PALETTE[3]} stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
        </motion.div>
      )}



      {/* Nodes */}
      <div className="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-x-3 gap-y-6">
        {stages.map((s, i) => {
          const isActive = i === activeIndex;
          return (
            <div key={s.title} className="flex flex-col items-center text-center gap-2">
                <motion.button
                  ref={(el) => {
                    nodeRefs.current[i] = el;
                  }}
                  onClick={() => onSelect(i)}
                  animate={
                    reduceMotion
                      ? {}
                      : isActive
                      ? { scale: 1.12, y: -2 }
                      : { scale: 1, y: 0 }
                  }
                  whileTap={reduceMotion ? {} : { scale: 0.95, y: 2 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="relative outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl"
                  aria-label={s.title}
                >
                <ToonIcon icon={s.icon} index={i} size="md" />
                <span
                  className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center text-[10px] font-bold font-mono"
                  style={{
                    background: "oklch(0.99 0 0)",
                    color: OUTLINE,
                    border: `2px solid ${OUTLINE}`,
                    borderRadius: 999,
                  }}
                >
                  {i + 1}
                </span>
              </motion.button>
              <span
                className={`text-[11px] leading-tight font-medium max-w-[88px] transition-opacity ${
                  isActive ? "opacity-100" : "opacity-55"
                }`}
                style={{ color: OUTLINE }}
              >
                {s.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
