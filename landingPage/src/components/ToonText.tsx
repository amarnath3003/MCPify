import { type CSSProperties } from "react";
import { motion } from "framer-motion";

// Palette pulled directly from the MCPify logo.
const LETTER_COLORS = [
  "oklch(0.84 0.17 70)",   // marigold yellow
  "oklch(0.74 0.17 5)",    // bubblegum pink
  "oklch(0.72 0.16 305)",  // lavender purple
  "oklch(0.88 0.21 130)",  // lime
  "oklch(0.78 0.15 50)",   // peach orange
  "oklch(0.88 0.09 180)",  // mint
];

const OUTLINE = "oklch(0.14 0.03 285)";

const letterStyle = (color: string): CSSProperties => ({
  color,
  display: "inline-block",
  textShadow: [
    `1px 0 0 ${OUTLINE}`,
    `-1px 0 0 ${OUTLINE}`,
    `0 1px 0 ${OUTLINE}`,
    `0 -1px 0 ${OUTLINE}`,
    `1px 1px 0 ${OUTLINE}`,
    `-1px 1px 0 ${OUTLINE}`,
    `1px -1px 0 ${OUTLINE}`,
    `-1px -1px 0 ${OUTLINE}`,
    `3px 3px 0 ${OUTLINE}`,
  ].join(", "),
});

interface ToonTextProps {
  children: string;
  /** Optional starting index into the palette, so adjacent ToonText blocks don't repeat. */
  offset?: number;
  className?: string;
}

export function ToonText({ children, offset = 0, className }: ToonTextProps) {
  let colorIdx = 0;
  return (
    <motion.span 
      className={className} 
      style={{ whiteSpace: "pre-wrap", display: "inline-block" }}
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.04 } },
        hidden: {},
      }}
    >
      {Array.from(children).map((ch, i) => {
        if (ch === " ") {
          return (
            <span key={i} aria-hidden="true">
              {"\u00A0"}
            </span>
          );
        }
        const color = LETTER_COLORS[(colorIdx + offset) % LETTER_COLORS.length];
        colorIdx += 1;
        return (
          <motion.span 
            key={i} 
            style={letterStyle(color)}
            variants={{
              hidden: { opacity: 0, y: 20, rotate: -10 },
              visible: { 
                opacity: 1, 
                y: 0, 
                rotate: 0,
                transition: { type: "spring", stiffness: 400, damping: 10 } 
              }
            }}
            whileHover={{ 
              y: -8, 
              rotate: i % 2 === 0 ? 5 : -5,
              scale: 1.1,
              transition: { type: "spring", stiffness: 400, damping: 10 }
            }}
          >
            {ch}
          </motion.span>
        );
      })}
    </motion.span>
  );
}
