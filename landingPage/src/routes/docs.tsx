import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  ArrowLeft,
  ArrowRight,
  Github,
  Book,
  Terminal,
  Shield,
  Workflow,
  Zap,
  Code,
  Database,
  Network,
} from "lucide-react";
import mcpifyLogo from "@/assets/logo.png";
import { Navbar } from "@/components/Navbar";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs - MCPify" },
      {
        name: "description",
        content:
          "MCPify documentation for the current repo: setup, CLI commands, analyzers, workflows, permissions, and generated MCP output.",
      },
      { property: "og:title", content: "Docs - MCPify" },
      {
        property: "og:description",
        content: "Reference docs for compiling real software into MCP-ready systems with MCPify.",
      },
    ],
  }),
  component: DocsPage,
});

type DocBlock = {
  kind: "p" | "code" | "h" | "list";
  text?: string;
  items?: string[];
};

type DocItem = {
  id: string;
  title: string;
  group: string;
  icon: typeof Book;
  summary: string;
  highlights: string[];
  command?: string;
  body: DocBlock[];
};

const docs: DocItem[] = [
  {
    id: "quick-start",
    group: "Get Started",
    icon: Zap,
    title: "Quick Start",
    summary: "Build the repo, run the compiler, and inspect the generated MCP server in ./.mcpify.",
    highlights: ["Local source workflow", "Generated MCP output", "Works with example apps"],
    command: "npx mcpify-cli analyze ./examples/express-api",
    body: [
      {
        kind: "p",
        text: "MCPify is easiest to try from source in this repo. Install dependencies, build the workspaces, then analyze one of the included example applications.",
      },
      { kind: "h", text: "Boot the repo" },
      { kind: "code", text: "npm install\nnpm run build" },
      { kind: "h", text: "Compile an example app" },
      { kind: "code", text: "npx mcpify-cli analyze ./examples/express-api" },
      {
        kind: "p",
        text: "The compiler writes its output to ./.mcpify by default, including the generated server, schemas, tool metadata, workflow definitions, and AGENTS.md.",
      },
    ],
  },
  {
    id: "installation",
    group: "Get Started",
    icon: Book,
    title: "Installation",
    summary: "This repo is currently set up as a source-first monorepo, so the docs should point people to npm install plus npm run build.",
    highlights: ["Source-first setup", "Private monorepo", "Node-based workflow"],
    command: "npm install\nnpm run build",
    body: [
      {
        kind: "p",
        text: "The current repository is private and organized as npm workspaces. The most reliable install path is to run MCPify from the repo itself rather than assuming a published global package.",
      },
      { kind: "code", text: "npm install\nnpm run build" },
      {
        kind: "p",
        text: "After that, use npx mcpify-cli <command> to invoke the compiled CLI entrypoint from the root workspace.",
      },
    ],
  },
  {
    id: "cli",
    group: "Get Started",
    icon: Terminal,
    title: "CLI Commands",
    summary: "The implemented CLI exposes analyze, interactive, audit, frontend, swagger, and simulate.",
    highlights: ["6 commands", "Optional analyzers", "Watch mode"],
    command:
      "npx mcpify-cli analyze . --swagger ./tests/fixtures/swagger/petstore.yaml --prisma ./tests/fixtures/prisma/simple.prisma",
    body: [
      { kind: "h", text: "Available commands" },
      {
        kind: "list",
        items: [
          "analyze [path] - run the full compiler pipeline and generate .mcpify output",
          "interactive - choose analyzers and source files through prompts",
          "audit [path] - run a static audit without writing generated files",
          "frontend [path] --json - extract UI actions only",
          "swagger <file> - convert an OpenAPI or Swagger spec directly into tools",
          "simulate [path] - run the static audit and optional AI simulation battery",
        ],
      },
      { kind: "h", text: "Useful analyze flags" },
      {
        kind: "list",
        items: [
          "--output <dir>",
          "--watch",
          "--no-frontend",
          "--no-events",
          "--no-workflows",
          "--swagger <file>",
          "--prisma <file>",
          "--drizzle <path>",
          "--mongoose <path>",
          "--ai-enhance",
        ],
      },
    ],
  },
  {
    id: "backend",
    group: "Pipeline",
    icon: Code,
    title: "Backend Analysis",
    summary: "Backend scanning is the first stage of the compiler and extracts callable actions from TypeScript and JavaScript code.",
    highlights: ["AST-based extraction", "Routes and services", "Tool signatures"],
    body: [
      {
        kind: "p",
        text: "The backend analyzer walks application code to find routes, controllers, services, and callable business actions that should become MCP tools.",
      },
      {
        kind: "p",
        text: "Those extracted actions become the base graph that later stages enrich with workflows, permission labels, schemas, and agent-facing descriptions.",
      },
    ],
  },
  {
    id: "frontend",
    group: "Pipeline",
    icon: Network,
    title: "Frontend Extraction",
    summary: "Frontend analysis focuses on user intent such as clicks, submissions, and navigations rather than low-level DOM details.",
    highlights: ["React and JSX", "Vue, Svelte, Angular", "UI action extraction"],
    command: "npx mcpify-cli frontend ./examples/internal-tool --json",
    body: [
      {
        kind: "p",
        text: "The frontend analyzer extracts agent-meaningful actions from components: button handlers, forms, and navigation flows that map to what a human user is trying to do.",
      },
      {
        kind: "list",
        items: [
          "React and JSX handlers",
          "Vue templates",
          "Svelte components",
          "Angular inline templates",
          "form submission intent",
        ],
      },
      {
        kind: "p",
        text: "This route is especially useful when you want to inspect the discovered UI action surface without running the full generator.",
      },
    ],
  },
  {
    id: "data-models",
    group: "Pipeline",
    icon: Database,
    title: "Data Models",
    summary: "Optional schema analyzers add database operations from Prisma, Drizzle, and Mongoose into the generated tool set.",
    highlights: ["Prisma", "Drizzle", "Mongoose"],
    command:
      "npx mcpify-cli analyze ./examples/ecommerce-saas --prisma ./examples/ecommerce-saas/prisma/schema.prisma",
    body: [
      {
        kind: "p",
        text: "MCPify can augment the core backend scan with data-model aware analyzers. These analyzers generate CRUD-style operations and enrich the tool graph with database-specific context.",
      },
      {
        kind: "list",
        items: [
          "--prisma <file> for Prisma schemas",
          "--drizzle <path> for Drizzle definitions",
          "--mongoose <path> for Mongoose schema or model files",
        ],
      },
    ],
  },
  {
    id: "events",
    group: "Pipeline",
    icon: Network,
    title: "Events and Webhooks",
    summary: "The event analyzer surfaces asynchronous entry points such as listeners, queues, and webhook handlers.",
    highlights: ["Webhook discovery", "Kafka", "RabbitMQ", "EventEmitter"],
    body: [
      {
        kind: "p",
        text: "If your application responds to messages instead of only direct HTTP requests, MCPify can still bring that surface into the tool graph.",
      },
      {
        kind: "list",
        items: [
          "webhook routes",
          "EventEmitter listeners",
          "Kafka consumers",
          "RabbitMQ consumers",
        ],
      },
      {
        kind: "p",
        text: "You can disable this stage with --no-events when you want a tighter compile focused on interactive or HTTP-driven paths.",
      },
    ],
  },
  {
    id: "workflows",
    group: "Pipeline",
    icon: Workflow,
    title: "Workflows",
    summary: "The workflow engine composes discovered tools into multi-step operations that agents can call as a single unit.",
    highlights: ["Multi-step flows", "Derived from tool graph", "Exposed as callable workflows"],
    body: [
      {
        kind: "p",
        text: "After collecting backend, frontend, data, and event tools, MCPify runs workflow detection to identify higher-level actions such as checkout, approval, or support handling flows.",
      },
      {
        kind: "p",
        text: "Detected workflows are emitted into workflows.ts and also exposed through the generated server as MCP-callable operations alongside regular tools.",
      },
    ],
  },
  {
    id: "permissions",
    group: "Safety",
    icon: Shield,
    title: "Permissions",
    summary: "Every tool and workflow is labeled so agent runtimes can distinguish safe reads from actions that need a human checkpoint.",
    highlights: ["SAFE", "REQUIRES_CONFIRMATION", "BLOCKED"],
    body: [
      {
        kind: "p",
        text: "The permission layer classifies every discovered action into SAFE, REQUIRES_CONFIRMATION, or BLOCKED. That classification is carried into generated metadata and the MCP server surface.",
      },
      {
        kind: "code",
        text: "SAFE\nREQUIRES_CONFIRMATION\nBLOCKED",
      },
      {
        kind: "p",
        text: "This keeps the generated surface useful to agents without flattening every action into the same trust level.",
      },
    ],
  },
  {
    id: "audit",
    group: "Safety",
    icon: Shield,
    title: "Audit and Simulation",
    summary: "MCPify includes both a static auditor and an optional AI simulation path for validating the generated surface.",
    highlights: ["Static audit", "Tool overview", "Optional AI security battery"],
    command: "npx mcpify-cli simulate ./examples/express-api",
    body: [
      {
        kind: "p",
        text: "The audit command analyzes backend and frontend sources, detects workflows, applies permissions, and then runs the static auditor to report safety issues without writing generated files.",
      },
      {
        kind: "p",
        text: "The simulate command runs the same static checks first. If ANTHROPIC_API_KEY is available, it then sends test prompts through the simulation engine to verify the exposed surface behaves safely under adversarial conditions.",
      },
    ],
  },
  {
    id: "output",
    group: "Reference",
    icon: Book,
    title: "Generated Output",
    summary: "The generated .mcpify directory is meant to be inspected, built, and extended rather than treated as opaque codegen.",
    highlights: ["server.ts", "handlers.ts", "tools.ts", "AGENTS.md"],
    body: [
      {
        kind: "list",
        items: [
          "server.ts - MCP entry point",
          "handlers.ts - generated handler registry and stubs",
          "tools.ts - tool metadata plus JSON schema definitions",
          "workflows.ts - inferred workflow definitions",
          "schemas.ts - generated input schemas",
          "AGENTS.md - agent-facing safety and setup guide",
        ],
      },
      {
        kind: "p",
        text: "Once generated, change into the output directory, install its dependencies, and build the standalone server package.",
      },
      { kind: "code", text: "cd .mcpify\nnpm install\nnpm run build" },
    ],
  },
  {
    id: "examples",
    group: "Reference",
    icon: Code,
    title: "Examples",
    summary: "The repo ships with multiple example applications that exercise different analyzers in the compiler pipeline.",
    highlights: ["Express API", "Ecommerce SaaS", "Internal tool", "Swagger-only"],
    body: [
      {
        kind: "list",
        items: [
          "examples/express-api",
          "examples/ecommerce-saas",
          "examples/internal-tool",
          "examples/nestjs-app",
          "examples/swagger-only",
        ],
      },
      {
        kind: "p",
        text: "These are the best starting points for validating new docs, demos, and screenshots because they reflect the actual fixture surface in the repo.",
      },
    ],
  },
];

const groupOrder = ["Get Started", "Pipeline", "Safety", "Reference"];
const repoUrl = "https://github.com/amarnath3003/MCPify";
const readmeUrl = `${repoUrl}#readme`;

function DocsPage() {
  const [activeId, setActiveId] = useState("quick-start");
  const [query, setQuery] = useState("");

  const filteredDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;

    return docs.filter((doc) => {
      const bodyText = doc.body
        .flatMap((block) => [block.text ?? "", ...(block.items ?? [])])
        .join(" ")
        .toLowerCase();

      const haystack = [
        doc.title,
        doc.group,
        doc.summary,
        ...doc.highlights,
        bodyText,
        doc.command ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [query]);

  useEffect(() => {
    if (filteredDocs.length === 0) return;
    if (!filteredDocs.some((doc) => doc.id === activeId)) {
      setActiveId(filteredDocs[0].id);
    }
  }, [activeId, filteredDocs]);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeId]);

  const grouped = useMemo(() => {
    return groupOrder
      .map((group) => ({
        group,
        items: filteredDocs.filter((doc) => doc.group === group),
      }))
      .filter((group) => group.items.length > 0);
  }, [filteredDocs]);

  const active = filteredDocs.find((doc) => doc.id === activeId) ?? filteredDocs[0] ?? docs[0];
  const activeIndex = docs.findIndex((doc) => doc.id === active.id);
  const previousDoc = activeIndex > 0 ? docs[activeIndex - 1] : null;
  const nextDoc = activeIndex >= 0 && activeIndex < docs.length - 1 ? docs[activeIndex + 1] : null;

  const stats = [
    { label: "CLI Commands", value: "6" },
    { label: "Doc Entries", value: String(docs.length) },
    { label: "Permission States", value: "3" },
    { label: "Generated Home", value: ".mcpify" },
  ];

  return (
    <main className="relative min-h-screen overflow-x-clip">
      <div className="absolute inset-0 grid-bg pointer-events-none z-0" />
      <Navbar />
      <div className="relative z-10 pt-28 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[oklch(0.99_0_0)] border-[3px] border-foreground shadow-[2px_2px_0_0_#000] text-xs font-mono uppercase tracking-widest text-primary mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
              Current Repo Docs
            </div>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
              <div>
                <h1 className="text-4xl md:text-5xl font-display font-semibold tracking-tight text-foreground">
                  <span className="gradient-text">Build with the code that exists.</span>
                </h1>
                <p className="mt-3 text-muted-foreground max-w-3xl leading-relaxed">
                  This docs view is aligned with the CLI and analyzers that are implemented in this repo today:
                  setup, commands, pipeline stages, safety checks, and generated MCP output.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {stats.map((stat) => (
                  <div key={stat.label} className="bg-[oklch(0.99_0_0)] border-[3px] border-foreground shadow-[4px_4px_0_0_#000] rounded-2xl p-4">
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary">
                      {stat.label}
                    </div>
                    <div className="mt-2 text-2xl font-display font-semibold text-foreground">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <div className="bg-zinc-950 rounded-3xl overflow-hidden border-[3px] border-foreground shadow-toon mb-24">
            <div className="grid gap-px bg-zinc-800/80 lg:grid-cols-[280px_minmax(0,1fr)_250px]">
              <aside className="bg-zinc-900/60 p-4 max-h-[45vh] lg:max-h-[calc(100vh-8rem)] lg:sticky lg:top-28 overflow-y-auto custom-scroll">
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 rounded-xl bg-zinc-900 text-zinc-200 border-[2px] border-foreground shadow-[2px_2px_0_0_#000] text-xs font-mono placeholder:text-zinc-600 focus:outline-none"
                    placeholder="Search commands, analyzers, safety..."
                  />
                </div>

                <div className="mb-4 px-2 text-[11px] font-mono uppercase tracking-widest text-zinc-500">
                  {filteredDocs.length} result{filteredDocs.length === 1 ? "" : "s"}
                </div>

                {grouped.map((section) => (
                  <div key={section.group} className="mb-5">
                    <div className="flex items-center justify-between px-2 mb-2">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
                        {section.group}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-600">
                        {section.items.length}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const isActive = item.id === active.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveId(item.id)}
                            className={`w-full text-left rounded-xl px-3 py-2 mb-1 transition-all border-[2px] ${
                              isActive
                                ? "bg-primary text-white font-medium border-foreground shadow-[2px_2px_0_0_#000]"
                                : "border-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                            }`}
                          >
                            <div className="text-sm font-medium">{item.title}</div>
                            <div className="mt-1 text-xs opacity-80">{item.summary}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {grouped.length === 0 && (
                  <div className="px-2 py-6 text-sm text-muted-foreground">
                    No matches yet. Try searching for <span className="text-foreground">audit</span>,
                    <span className="text-foreground"> prisma</span>, or
                    <span className="text-foreground"> workflows</span>.
                  </div>
                )}
              </aside>

              <motion.article
                key={active.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-zinc-950 p-8 md:p-10"
              >
                <div className="text-xs font-mono text-zinc-500 mb-2 uppercase tracking-widest">
                  {active.group}
                </div>

                <div className="flex items-start gap-4 mb-6">
                  <div className="rounded-2xl bg-primary/20 p-3 border border-primary/30">
                    <active.icon className="w-7 h-7 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-3xl md:text-4xl font-display font-semibold tracking-tight text-white">
                      {active.title}
                    </h2>
                    <p className="mt-3 text-zinc-400 leading-relaxed max-w-3xl">{active.summary}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-6">
                  {active.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="inline-flex items-center rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-mono text-zinc-300"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>

                {active.command && (
                  <div className="mb-8 rounded-2xl border border-primary/30 bg-primary/10 p-5">
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary mb-3">
                      Example Command
                    </div>
                    <pre className="font-mono text-sm overflow-x-auto whitespace-pre-wrap text-zinc-200">
                      {active.command}
                    </pre>
                  </div>
                )}

                <div className="space-y-5">
                  {active.body.map((block, index) => {
                    if (block.kind === "p") {
                      return (
                        <p key={index} className="text-zinc-400 leading-relaxed">
                          {block.text}
                        </p>
                      );
                    }

                    if (block.kind === "h") {
                      return (
                        <h3 key={index} className="pt-2 text-lg font-display font-semibold text-zinc-100">
                          {block.text}
                        </h3>
                      );
                    }

                    if (block.kind === "code") {
                      return (
                        <pre
                          key={index}
                          className="bg-black text-zinc-300 border border-zinc-800 rounded-2xl p-4 font-mono text-sm overflow-x-auto whitespace-pre-wrap"
                        >
                          {block.text}
                        </pre>
                      );
                    }

                    if (block.kind === "list" && block.items) {
                      return (
                        <ul key={index} className="space-y-2">
                          {block.items.map((item) => (
                            <li key={item} className="flex gap-3 text-sm text-zinc-400">
                              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      );
                    }

                    return null;
                  })}
                </div>

                <div className="mt-10 grid gap-3 md:grid-cols-2">
                  {previousDoc ? (
                    <button
                      type="button"
                      onClick={() => setActiveId(previousDoc.id)}
                      className="rounded-2xl border-[2px] border-foreground bg-zinc-900 p-4 text-left hover:shadow-[4px_4px_0_0_#000] hover:-translate-y-0.5 transition-all"
                    >
                      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-2">
                        Previous
                      </div>
                      <div className="inline-flex items-center gap-2 font-medium text-zinc-200">
                        <ArrowLeft className="w-4 h-4" />
                        {previousDoc.title}
                      </div>
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-600">
                      Start here. This is the first docs entry.
                    </div>
                  )}

                  {nextDoc ? (
                    <button
                      type="button"
                      onClick={() => setActiveId(nextDoc.id)}
                      className="rounded-2xl border-[2px] border-foreground bg-zinc-900 p-4 text-left hover:shadow-[4px_4px_0_0_#000] hover:-translate-y-0.5 transition-all"
                    >
                      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-2">
                        Next
                      </div>
                      <div className="inline-flex items-center gap-2 font-medium text-zinc-200">
                        {nextDoc.title}
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-600">
                      You reached the last reference card.
                    </div>
                  )}
                </div>

                <div className="mt-10 pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to home
                  </Link>
                  <a
                    href={readmeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-foreground transition-colors"
                  >
                    Open README
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </motion.article>

              <aside className="bg-zinc-900/60">
                <div className="p-5 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] overflow-y-auto space-y-5 custom-scroll">
                  <div className="rounded-2xl border-[2px] border-foreground bg-[oklch(0.72_0.16_305_/_0.15)] shadow-[4px_4px_0_0_#000] p-4">
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary mb-2">
                      Selected Entry
                    </div>
                    <div className="text-lg font-display font-semibold text-white">{active.title}</div>
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{active.summary}</p>
                  </div>

                  <div className="rounded-2xl border-[2px] border-foreground bg-[oklch(0.74_0.17_5_/_0.15)] shadow-[4px_4px_0_0_#000] p-4">
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent mb-3">
                      Quick Facts
                    </div>
                    <ul className="space-y-2">
                      {active.highlights.map((highlight) => (
                        <li key={highlight} className="flex gap-2 text-sm text-zinc-400">
                          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {active.command && (
                    <div className="rounded-2xl border-[2px] border-foreground bg-[oklch(0.84_0.17_70_/_0.15)] shadow-[4px_4px_0_0_#000] p-4">
                      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-secondary mb-3">
                        Run This
                      </div>
                      <pre className="font-mono text-xs whitespace-pre-wrap break-words text-zinc-200">
                        {active.command}
                      </pre>
                    </div>
                  )}

                  <div className="rounded-2xl border-[2px] border-foreground bg-zinc-900 shadow-[4px_4px_0_0_#000] p-4">
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 mb-3">
                      Links
                    </div>
                    <div className="space-y-2 text-sm">
                      <a
                        href={repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <Github className="w-4 h-4" />
                        View repository
                      </a>
                      <a
                        href={readmeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <Book className="w-4 h-4" />
                        Read README
                      </a>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
