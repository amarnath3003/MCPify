import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { forwardRef, useEffect, useRef, useState } from "react";
import { TOON_PALETTE } from "./ToonIcon";

const OUTLINE = "oklch(0.14 0.03 285)";
const AUTO_MS = 2600;

export interface Layer {
  name: string;
  items: string[];
  description: string;
  primary?: boolean;
}

export function ArchitectureStack({ layers }: { layers: Layer[] }) {
  const primaryIdx = Math.max(0, layers.findIndex((l) => l.primary));
  const [active, setActive] = useState(primaryIdx);
  const [hovered, setHovered] = useState(false);
  const pausedUntil = useRef(0);
  const stackRef = useRef<HTMLDivElement>(null);
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [dotTop, setDotTop] = useState<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => {
      if (hovered || Date.now() < pausedUntil.current) return;
      setActive((i) => (i + 1) % layers.length);
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [hovered, reduce, layers.length]);

  const select = (i: number) => {
    setActive(i);
    pausedUntil.current = Date.now() + 5000;
  };

  useEffect(() => {
    const updateDot = () => {
      const stack = stackRef.current;
      const layer = layerRefs.current[active];
      if (!stack || !layer) return;

      const stackRect = stack.getBoundingClientRect();
      const layerRect = layer.getBoundingClientRect();
      setDotTop(layerRect.top - stackRect.top + layerRect.height / 2);
    };

    updateDot();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateDot) : null;
    if (observer && stackRef.current) observer.observe(stackRef.current);
    window.addEventListener("resize", updateDot);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateDot);
    };
  }, [active, layers.length]);

  return (
    <div
      className="grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Stack */}
      <div ref={stackRef} className="relative mx-auto w-full max-w-[560px]">
        {/* Side rail with traveling dot */}
        <div className="absolute left-0 inset-y-0 w-8 pointer-events-none">
          {/* dashed spine */}
          <div
            className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2"
            style={{
              width: 0,
              borderLeft: `2.5px dashed ${OUTLINE}`,
              opacity: 0.25,
            }}
          />
          {/* arrow tip at bottom */}
          <svg
            className="absolute left-1/2 -translate-x-1/2 -bottom-1"
            width="14"
            height="10"
            viewBox="0 0 14 10"
          >
            <path
              d="M1,1 L7,9 L13,1"
              fill="none"
              stroke={OUTLINE}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.5"
            />
          </svg>
          {/* traveling dot — snaps to active slab */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-30"
            animate={{ top: dotTop ?? 0 }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 220, damping: 22 }
            }
          >
            <div
              className="relative w-4 h-4 rounded-full flex items-center justify-center"
              style={{
                background: TOON_PALETTE[3],
                border: `2.5px solid ${OUTLINE}`,
                boxShadow: `0 0 0 5px color-mix(in oklab, ${TOON_PALETTE[3]} 30%, transparent)`,
              }}
            >
              {!reduce && (
                <motion.span
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: TOON_PALETTE[3],
                  }}
                  animate={{ scale: [1, 1.9, 1], opacity: [0.55, 0, 0.55] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
              )}
            </div>
          </motion.div>
        </div>

        {/* Slabs — left-padded to make room for the rail */}
        <div className="relative pl-12 space-y-3">
          {layers.map((layer, i) => (
            <Slab
              key={layer.name}
              ref={(node) => {
                layerRefs.current[i] = node;
              }}
              layer={layer}
              tint={TOON_PALETTE[i % TOON_PALETTE.length]}
              index={i}
              total={layers.length}
              isActive={i === active}
              onActivate={() => select(i)}
              reduce={!!reduce}
            />
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div
        className="relative p-7 min-h-[260px]"
        style={{
          background: "oklch(0.99 0 0)",
          border: `3px solid ${OUTLINE}`,
          borderRadius: "1.5rem",
          boxShadow: `6px 6px 0 0 ${OUTLINE}`,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[11px] font-mono px-2 py-0.5"
                style={{
                  background: "oklch(0.96 0 0)",
                  border: `2px solid ${OUTLINE}`,
                  borderRadius: 6,
                  color: OUTLINE,
                }}
              >
                Layer 0{active + 1} / 0{layers.length}
              </span>
              {layers[active].primary && (
                <span
                  className="text-[11px] font-mono font-bold px-2 py-0.5"
                  style={{
                    background: TOON_PALETTE[3],
                    border: `2px solid ${OUTLINE}`,
                    borderRadius: 6,
                    color: OUTLINE,
                  }}
                >
                  CORE
                </span>
              )}
            </div>
            <h3 className="font-display text-2xl font-bold" style={{ color: OUTLINE }}>
              {layers[active].name}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "oklch(0.4 0.02 285)" }}>
              {layers[active].description}
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              {layers[active].items.map((item, j) => (
                <span
                  key={item}
                  className="px-2.5 py-1 text-xs font-mono"
                  style={{
                    background: TOON_PALETTE[(active + j) % TOON_PALETTE.length],
                    color: OUTLINE,
                    border: `2px solid ${OUTLINE}`,
                    borderRadius: 8,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

const Slab = forwardRef<HTMLDivElement, {
  layer: Layer;
  tint: string;
  index: number;
  total: number;
  isActive: boolean;
  onActivate: () => void;
  reduce: boolean;
}>(function Slab({
  layer,
  tint,
  index,
  isActive,
  onActivate,
  reduce,
}, ref) {
  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : { opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.07, type: "spring", stiffness: 170, damping: 20 }}
      className="relative"
    >
      {/* Connector tick from spine to slab */}
      <div
        className="absolute top-1/2 -translate-y-1/2 h-[2.5px] pointer-events-none"
        style={{
          left: "-2.5rem",
          width: "2rem",
          background: isActive ? OUTLINE : "transparent",
          borderTop: isActive ? "none" : `2.5px dashed ${OUTLINE}`,
          opacity: isActive ? 1 : 0.35,
          transition: "opacity 0.25s, background 0.25s",
        }}
      />
      <button
        type="button"
        onMouseEnter={onActivate}
        onFocus={onActivate}
        onClick={onActivate}
        aria-label={layer.name}
        className="relative block w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-2xl transition-all duration-200 will-change-transform active:scale-[0.98]"
        style={{
          transform: isActive && !reduce ? "translateX(6px) scale(1.015)" : "translateX(0) scale(1)",
        }}
      >
        <div
          className="relative flex items-center justify-between px-5 py-3.5"
          style={{
            background: isActive
              ? `linear-gradient(180deg, color-mix(in oklab, ${tint} 50%, white) 0%, ${tint} 100%)`
              : `linear-gradient(180deg, color-mix(in oklab, ${tint} 25%, white) 0%, color-mix(in oklab, ${tint} 60%, white) 100%)`,
            border: `3px solid ${OUTLINE}`,
            borderRadius: "0.9rem",
            boxShadow: isActive
              ? `6px 6px 0 0 ${OUTLINE}, 0 0 0 4px color-mix(in oklab, ${tint} 50%, transparent)`
              : `4px 4px 0 0 ${OUTLINE}`,
            minHeight: 60,
          }}
        >
          <div
            className="absolute inset-x-2 top-1 h-[2px] rounded-full pointer-events-none"
            style={{ background: "rgba(255,255,255,0.55)" }}
          />
          <div className="flex items-center gap-2.5 relative z-10">
            <span
              className="w-7 h-7 flex items-center justify-center text-[11px] font-bold font-mono"
              style={{
                background: "oklch(0.99 0 0)",
                border: `2.5px solid ${OUTLINE}`,
                borderRadius: 8,
                color: OUTLINE,
              }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className="font-display font-bold text-[15px] tracking-tight"
              style={{ color: OUTLINE }}
            >
              {layer.name}
            </span>
          </div>
          <div className="flex items-center gap-2 relative z-10">
            {layer.primary && (
              <span
                className="text-[10px] font-mono font-bold px-1.5 py-0.5"
                style={{
                  background: OUTLINE,
                  color: "oklch(0.99 0 0)",
                  borderRadius: 4,
                }}
              >
                MCP
              </span>
            )}
            {/* hint chips of items, fade in when active */}
            <div className="hidden sm:flex items-center gap-1.5">
              {layer.items.slice(0, 2).map((it) => (
                <span
                  key={it}
                  className="text-[10px] font-mono px-1.5 py-0.5 transition-opacity duration-200"
                  style={{
                    background: "oklch(0.99 0 0)",
                    border: `2px solid ${OUTLINE}`,
                    borderRadius: 4,
                    color: OUTLINE,
                    opacity: isActive ? 1 : 0.45,
                  }}
                >
                  {it}
                </span>
              ))}
            </div>
          </div>
        </div>
      </button>
    </motion.div>
  );
});
