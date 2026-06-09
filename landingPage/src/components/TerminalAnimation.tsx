import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const lines = [
  { text: "$ npx mcpify-cli analyze .", delay: 0 },
  { text: "→ Scanning backend routes...", delay: 800 },
  { text: "→ Detecting workflows...", delay: 1600 },
  { text: "→ Extracting frontend actions...", delay: 2400 },
  { text: "→ Generating MCP server...", delay: 3200 },
  { text: "→ Applying safety rules...", delay: 4000 },
  { text: "", delay: 4400 },
  { text: "✓ checkoutCart()", delay: 4800, glow: true },
  { text: "✓ refundOrder()", delay: 5100, glow: true },
  { text: "✓ createSupportTicket()", delay: 5400, glow: true },
  { text: "✓ purchaseWorkflow()", delay: 5700, glow: true },
  { text: "", delay: 6000 },
  { text: "AI system generated successfully.", delay: 6200, success: true },
];

export function TerminalAnimation({ compact = false }: { compact?: boolean }) {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible((v) => (v >= lines.length ? 0 : v + 1));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className={`glass rounded-[1.5rem] overflow-hidden ${compact ? "" : "max-w-2xl"}`}
      style={{ 
        boxShadow: "var(--shadow-toon-lg)",
        border: "var(--outline-w) solid var(--color-foreground)"
      }}
    >
      <div className="flex items-center gap-2 px-5 py-4 border-b-[3px] border-foreground bg-[oklch(0.96_0.02_90)]">
        <div className="flex gap-2">
          <motion.span whileHover={{ scale: 1.2 }} className="w-3.5 h-3.5 rounded-full bg-destructive border-[2px] border-foreground" />
          <motion.span whileHover={{ scale: 1.2 }} className="w-3.5 h-3.5 rounded-full bg-[oklch(0.84_0.17_70)] border-[2px] border-foreground" />
          <motion.span whileHover={{ scale: 1.2 }} className="w-3.5 h-3.5 rounded-full bg-[oklch(0.88_0.21_130)] border-[2px] border-foreground" />
        </div>
        <span className="text-xs font-display font-bold ml-3 text-foreground/80 tracking-wide">~/project — mcpify</span>
      </div>
      <div className="p-6 font-mono text-sm sm:text-base min-h-[360px] bg-foreground text-[oklch(0.98_0.01_90)] font-medium leading-relaxed">
        {lines.slice(0, visible).map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -10, y: 5 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className={
              line.success
                ? "text-[oklch(0.88_0.21_130)] font-bold mt-2"
                : line.glow
                  ? "text-[oklch(0.84_0.17_70)]"
                  : line.text.startsWith("$")
                    ? "text-[oklch(0.72_0.16_305)] font-bold"
                    : "text-[oklch(0.96_0.02_90)]/80"
            }
          >
            {line.text || "\u00A0"}
          </motion.div>
        ))}
        {visible < lines.length && (
          <motion.span 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ repeat: Infinity, duration: 0.8, repeatType: "reverse" }}
            className="inline-block w-2.5 h-5 bg-[oklch(0.88_0.21_130)] align-middle ml-1 rounded-sm" 
          />
        )}
      </div>
    </motion.div>
  );
}
