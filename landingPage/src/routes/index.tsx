import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Github,
  Boxes,
  Network,
  Workflow,
  Lock,
  Brain,
  Database,
  Radio,
  GitGraph,
  RefreshCw,
  TestTube,
  Sparkles,
  Check,
  X,
} from "lucide-react";
import { TerminalAnimation } from "@/components/TerminalAnimation";
import { Section } from "@/components/Section";
import { Pipeline } from "@/components/Pipeline";

import { FrontendTransform } from "@/components/FrontendTransform";
import { ToonText } from "@/components/ToonText";
import { FeatureCarousel } from "@/components/FeatureCarousel";
import { ArchitectureStack } from "@/components/ArchitectureStack";
import mcpifyLogo from "@/assets/mcpify-logo.png.asset.json";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MCPify — Compile Software into AI-Operable Systems" },
      {
        name: "description",
        content:
          "MCPify is the AI Enablement Compiler. Transform applications, APIs, frontends, workflows, and databases into AI-native systems for autonomous agents.",
      },
      { property: "og:title", content: "MCPify — AI Enablement Compiler" },
      {
        property: "og:description",
        content: "Turn any application into an AI-operable system, automatically.",
      },
    ],
  }),
  component: Index,
});

const TOON_TINTS = [
  "oklch(0.88 0.21 130)", // lime
  "oklch(0.74 0.17 5)",   // pink
  "oklch(0.72 0.16 305)", // purple
  "oklch(0.78 0.15 50)",  // peach
  "oklch(0.84 0.17 70)",  // yellow
  "oklch(0.88 0.09 180)", // mint
];

const features = [
  { icon: Boxes, title: "Backend Analyzer", desc: "Deep AST analysis of routes, controllers, and services to surface every callable action.", tint: TOON_TINTS[0] },
  { icon: Network, title: "Frontend Action Extraction", desc: "React, Vue, Svelte components mapped to agent-controllable actions.", tint: TOON_TINTS[1] },
  { icon: GitGraph, title: "OpenAPI → MCP", desc: "Drop in a spec, ship a typed MCP server in seconds.", tint: TOON_TINTS[2] },
  { icon: Workflow, title: "Workflow Engine", desc: "Multi-step processes detected and exposed as atomic agent capabilities.", tint: TOON_TINTS[3] },
  { icon: Lock, title: "Permission Layer", desc: "Scopes, roles, and audit trails enforced at the tool boundary.", tint: TOON_TINTS[4] },
  { icon: Brain, title: "AI Metadata Enhancement", desc: "Auto-generated descriptions, hints, and examples agents actually understand.", tint: TOON_TINTS[5] },
  { icon: Database, title: "Database Intelligence", desc: "Schemas, relations, and constraints become safe, queryable surfaces.", tint: TOON_TINTS[0] },
  { icon: Radio, title: "Event System Integration", desc: "Webhooks, queues, and pub/sub plugged into agent loops.", tint: TOON_TINTS[1] },
  { icon: Sparkles, title: "Knowledge Graph Engine", desc: "Entities, intents, and relations modeled across your stack.", tint: TOON_TINTS[2] },
  { icon: RefreshCw, title: "Self-Updating Sync", desc: "MCP definitions regenerate on every commit. No drift.", tint: TOON_TINTS[3] },
  { icon: TestTube, title: "AI Simulations", desc: "Run agents against your app in a sandbox before shipping.", tint: TOON_TINTS[4] },
];

const useCases = [
  { title: "SaaS Platforms", desc: "Let customers automate your product with their own agents.", tint: TOON_TINTS[0] },
  { title: "AI Agents", desc: "Give agents real surface area: real apps, real data, real actions.", tint: TOON_TINTS[1] },
  { title: "Enterprise Tools", desc: "Make legacy internal systems addressable by modern AI.", tint: TOON_TINTS[2] },
  { title: "Autonomous Workflows", desc: "Chain operations across services with guardrails baked in.", tint: TOON_TINTS[3] },
  { title: "Internal Dashboards", desc: "Operate ops tooling via natural language, safely.", tint: TOON_TINTS[4] },
  { title: "AI Coding Systems", desc: "Codegen agents that understand your stack end-to-end.", tint: TOON_TINTS[5] },
];





function Index() {
  return (
    <main className="relative min-h-screen overflow-x-clip">
      <Nav />
      <Hero />
      <Problem />
      <Section
        id="how"
        eyebrow="How it works"
        title="From source code to AI-operable surface."
        description="A compiler pipeline that understands your software the way an agent needs to. Static analysis, semantic mapping, safety, and MCP generation — in one pass."
      >
        <Pipeline />
      </Section>

      <Section
        id="features"
        eyebrow="Features"
        title="A complete enablement toolchain."
        description="Every layer of your stack, made addressable. Type-safe, permissioned, and continuously synced with your codebase."
      >
        <FeatureCarousel features={features} />

      </Section>

      <Section
        id="frontend"
        eyebrow="Frontend → MCP"
        title="UIs become agent actions."
        description="MCPify reads your components and produces high-fidelity action descriptors. Agents can operate your app like a human would — click, type, navigate, complete flows."
      >
        <FrontendTransform />
      </Section>

      <Section
        id="terminal"
        eyebrow="Live Demo"
        title="One command. Full AI surface."
        description="Point MCPify at your repo. Watch your application get compiled into a typed, safe, callable system in under a minute."
      >
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
          <TerminalAnimation />
          <div>
            <ul className="space-y-4 text-sm">
              {[
                "Zero-config detection of frameworks, routes, and data layers.",
                "Generated MCP server, fully typed and permissioned.",
                "Drop into Claude, GPT, or any MCP-compatible agent runtime.",
                "Re-runs on every push. Always in sync with your codebase.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-1 w-5 h-5 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </span>
                  <span className="text-muted-foreground leading-relaxed">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>


      <Architecture />



      <Section
        id="usecases"
        eyebrow="Use Cases"
        title="Built for builders shipping AI."
      >
        <FeatureCarousel features={useCases} />
      </Section>

      <FinalCTA />
      <Footer />
    </main>
  );
}

function Nav() {
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="glass rounded-full px-5 py-2.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo />
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <Link to="/docs" className="hover:text-foreground transition-colors">Docs</Link>
            <Link to="/roadmap" className="hover:text-foreground transition-colors">Roadmap</Link>
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="https://github.com/amarnath3003/MCPify"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full transition-colors"
            >
              <Github className="w-4 h-4" />
              <span className="font-mono">12.4k</span>
            </a>
            <a
              href="#cta"
              className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity font-medium"
            >
              Get Started
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

function Logo({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <img
      src={mcpifyLogo.url}
      alt="MCPify"
      className={className}
      style={{ filter: "drop-shadow(2px 2px 0 oklch(0.18 0.04 285))" }}
    />
  );
}

function Hero() {
  return (
    <section className="relative pt-40 pb-24 px-6 overflow-hidden">
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-[600px] pointer-events-none" style={{ background: "var(--gradient-hero)" }} />

      <div className="relative max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs font-mono text-muted-foreground mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
            v0.4 — Frontend extraction now in beta
          </div>

          <h1 className="text-5xl md:text-7xl font-display font-semibold tracking-tight leading-[1.02]">
            <ToonText>Compile Software</ToonText>
            <br />
            <span className="text-foreground">into AI-Operable Systems</span>
          </h1>

          <p className="mt-7 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            MCPify automatically transforms applications, APIs, frontends, workflows, and databases into AI-native systems for autonomous agents.
          </p>

          <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
            <a
              href="#cta"
              className="group inline-flex items-center gap-2 px-5 py-3 rounded-full bg-foreground text-background font-medium hover:shadow-glow transition-all"
            >
              Get Started
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#terminal"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full glass text-foreground hover:bg-foreground/5 transition-colors"
            >
              View Demo
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-20 grid lg:grid-cols-[1fr_1fr] gap-8 items-center"
        >
          <TerminalAnimation />
          <HeroDiagram />
        </motion.div>
      </div>
    </section>
  );
}

function HeroDiagram() {
  const leftNodes = [
    { label: "Backend", y: 22, color: "oklch(0.84 0.17 70)" },
    { label: "Frontend", y: 50, color: "oklch(0.74 0.17 5)" },
    { label: "Database", y: 78, color: "oklch(0.88 0.09 180)" },
  ];
  const rightNodes = [
    { label: "Agent", y: 35, color: "oklch(0.88 0.21 130)" },
    { label: "Workflow", y: 65, color: "oklch(0.78 0.15 50)" },
  ];

  const leftPaths = leftNodes.map((n) => `M 18 ${n.y} C 32 ${n.y}, 36 50, 46 50`);
  const rightPaths = rightNodes.map((n) => `M 54 50 C 64 50, 68 ${n.y}, 78 ${n.y}`);

  return (
    <div className="relative h-[420px] glass rounded-2xl overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="flow-left" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.14 0.03 285)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="oklch(0.14 0.03 285)" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="flow-right" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.14 0.03 285)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="oklch(0.14 0.03 285)" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        {leftPaths.map((d, i) => (
          <path key={`lb-${i}`} d={d} stroke="url(#flow-left)" strokeWidth="0.6" fill="none" />
        ))}
        {rightPaths.map((d, i) => (
          <path key={`rb-${i}`} d={d} stroke="url(#flow-right)" strokeWidth="0.6" fill="none" />
        ))}

        {leftPaths.map((d, i) => (
          <path
            key={`la-${i}`}
            d={d}
            stroke={leftNodes[i].color}
            strokeWidth="0.9"
            fill="none"
            strokeDasharray="3 8"
            strokeLinecap="round"
            style={{ animation: `dashFlow 2.4s linear ${i * 0.3}s infinite` }}
          />
        ))}
        {rightPaths.map((d, i) => (
          <path
            key={`ra-${i}`}
            d={d}
            stroke={rightNodes[i].color}
            strokeWidth="0.9"
            fill="none"
            strokeDasharray="3 8"
            strokeLinecap="round"
            style={{ animation: `dashFlow 2.4s linear ${0.6 + i * 0.3}s infinite` }}
          />
        ))}
      </svg>

      <style>{`
        @keyframes dashFlow {
          from { stroke-dashoffset: 22; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes logoPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1) rotate(-2deg); }
          50%      { transform: translate(-50%, -50%) scale(1.06) rotate(2deg); }
        }
      `}</style>

      {leftNodes.map((n, i) => (
        <motion.div
          key={n.label}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 + i * 0.1 }}
          className="absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap glass text-foreground"
          style={{ left: "14%", top: `${n.y}%`, borderColor: n.color }}
        >
          {n.label}
        </motion.div>
      ))}

      {rightNodes.map((n, i) => (
        <motion.div
          key={n.label}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8 + i * 0.1 }}
          className="absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-mono whitespace-nowrap glass text-foreground"
          style={{ left: "82%", top: `${n.y}%`, borderColor: n.color }}
        >
          {n.label}
        </motion.div>
      ))}

      <div
        className="absolute"
        style={{ left: "50%", top: "50%", animation: "logoPulse 4s ease-in-out infinite" }}
      >
        <div
          className="rounded-2xl bg-background p-3 border-[3px]"
          style={{ borderColor: "oklch(0.14 0.03 285)", boxShadow: "var(--shadow-toon)" }}
        >
          <img
            src={mcpifyLogo.url}
            alt="MCPify"
            className="h-10 w-auto"
            style={{ filter: "drop-shadow(2px 2px 0 oklch(0.14 0.03 285))" }}
          />
        </div>
      </div>

      {["checkoutCart()", "refundOrder()", "sendEmail()"].map((t, i) => (
        <motion.div
          key={t}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, y: [0, -8, 0] }}
          transition={{ delay: 1 + i * 0.2, y: { duration: 4 + i, repeat: Infinity, ease: "easeInOut" } }}
          className="absolute glass rounded-md px-2.5 py-1 text-[10px] font-mono text-primary"
          style={{ right: "6%", top: `${6 + i * 10}%` }}
        >
          ✓ {t}
        </motion.div>
      ))}
    </div>
  );
}

function Problem() {
  return (
    <Section
      id="problem"
      eyebrow="The Problem"
      title="Software wasn't built for agents."
      description="Today's apps are built for humans — disconnected from AI, glued together with brittle integrations and hand-written MCP boilerplate. AI agents can read your screen, but they can't actually drive your software."
    >
      <div className="grid md:grid-cols-2 gap-5">
        <Compare
          title="Traditional Apps"
          tone="negative"
          items={[
            "Built for human point-and-click",
            "Disconnected from AI agents",
            "Manual MCP tool authoring",
            "Repetitive integration boilerplate",
            "Unsafe direct API access",
          ]}
        />
        <Compare
          title="AI-Operable Apps"
          tone="positive"
          items={[
            "Native agent-callable surface",
            "Continuously generated MCP",
            "Type-safe, permissioned actions",
            "Workflows as first-class tools",
            "Audited, sandboxed, simulated",
          ]}
        />
      </div>
    </Section>
  );
}

function Compare({ title, items, tone }: { title: string; items: string[]; tone: "positive" | "negative" }) {
  const positive = tone === "positive";
  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      whileHover={{ y: -5, scale: 1.01 }}
      className={`glass rounded-2xl p-8 ${positive ? "" : ""}`}
      style={{
        boxShadow: positive ? "var(--shadow-toon-lg)" : "var(--shadow-toon)",
        border: `var(--outline-w) solid var(--color-foreground)`,
        backgroundColor: positive ? "oklch(0.98 0.01 90)" : "oklch(0.96 0.02 90)"
      }}
    >
      <h3 className="font-display font-bold text-2xl mb-6 flex items-center gap-3">
        {positive ? (
          <span className="w-3 h-3 rounded-full bg-[oklch(0.88_0.21_130)] border-[2px] border-foreground shadow-glow" />
        ) : (
          <span className="w-3 h-3 rounded-full bg-[oklch(0.74_0.17_5)] border-[2px] border-foreground" />
        )}
        {title}
      </h3>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <motion.li 
            key={item} 
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, type: "spring", stiffness: 300 }}
            className="flex gap-3.5 text-base font-medium items-start"
          >
            {positive ? (
              <Check className="w-5 h-5 mt-0.5 text-[oklch(0.88_0.21_130)] shrink-0 stroke-[3px]" />
            ) : (
              <X className="w-5 h-5 mt-0.5 text-muted-foreground/60 shrink-0 stroke-[3px]" />
            )}
            <span className={positive ? "text-foreground" : "text-muted-foreground"}>{item}</span>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  );
}

function Architecture() {
  const layers = [
    {
      name: "AI Agents",
      items: ["Claude", "GPT", "Custom"],
      description: "Any agent runtime — connect over MCP and start operating your software like a power user.",
    },
    {
      name: "MCP Layer",
      items: ["Tools", "Resources", "Prompts"],
      primary: true,
      description: "Generated tools, resources, and prompts that map 1:1 to real surface in your app. The contract agents speak.",
    },
    {
      name: "Permissions",
      items: ["Scopes", "Audit", "Rate Limits"],
      description: "Every call passes through scopes, audit logs, and rate limits before it touches your system.",
    },
    {
      name: "Workflows",
      items: ["Multi-step", "Stateful", "Composable"],
      description: "Discovered user journeys exposed as composable, stateful operations agents can chain.",
    },
    {
      name: "Your App",
      items: ["Frontend", "Backend", "Database", "APIs"],
      description: "Your existing stack — untouched. MCPify reads it; it never rewrites it.",
    },
  ];
  return (
    <Section
      id="architecture"
      eyebrow="Architecture"
      title="Built for the way agents actually operate."
      description="A layered system that keeps your application untouched while exposing exactly what agents need — and nothing more."
    >
      <ArchitectureStack layers={layers} />
    </Section>
  );
}



function FinalCTA() {
  return (
    <section id="cta" className="relative py-32 px-6 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "var(--gradient-hero)" }} />
      <div className="absolute inset-0 grid-bg pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative max-w-3xl mx-auto text-center"
      >
        <h2 className="text-5xl md:text-6xl font-display font-semibold tracking-tight leading-[1.05]">
          <span className="gradient-text">Make Your Software</span>
          <br />
          <span className="text-foreground">AI-Native.</span>
        </h2>
        <p className="mt-6 text-lg text-muted-foreground">
          Stop hand-writing MCP tools. Compile your stack once. Stay in sync forever.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
          <a
            href="#"
            className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-foreground text-background font-medium hover:shadow-glow transition-all"
          >
            Start Building
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="#"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full glass text-foreground hover:bg-foreground/5 transition-colors"
          >
            <Github className="w-4 h-4" />
            View GitHub
          </a>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-border px-6 py-12">
      <div className="max-w-7xl mx-auto flex flex-wrap gap-8 items-start justify-between">
        <div className="max-w-xs">
          <div className="mb-3">
            <Logo className="h-10 w-auto" />
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The AI Enablement Compiler. Infrastructure for the future of AI software.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
          {[
            { h: "Product", l: ["Docs", "Examples", "Roadmap"] },
            { h: "Community", l: ["GitHub", "Discord", "Twitter"] },
            { h: "Company", l: ["About", "Blog", "Careers"] },
            { h: "Legal", l: ["Privacy", "Terms", "Security"] },
          ].map((c) => (
            <div key={c.h}>
              <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-3">{c.h}</div>
              <ul className="space-y-2">
                {c.l.map((i) => (
                  <li key={i}>
                    <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                      {i}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-10 pt-6 border-t border-border flex items-center justify-between text-xs font-mono text-muted-foreground">
        <span>© 2026 MCPify, Inc.</span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
          All systems operational
        </span>
      </div>
    </footer>
  );
}
