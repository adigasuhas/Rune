import type { NextConfig } from "next";

// Content-Security-Policy. The notebook-XSS class is fixed at the source
// (output sanitisation in src/lib/sanitizeHtml.ts); this is the defence in
// depth. `unsafe-inline` for style is required by the app's heavy inline-style
// use and Tailwind; `unsafe-eval` is only needed by the dev overlay and is
// dropped in production.
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Optional Pusher realtime transport for team chat.
  "connect-src 'self' https://*.pusher.com wss://*.pusher.com",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // microphone=(self): notebook dictation's local-Whisper fallback records
  // via getUserMedia when the browser has no built-in speech recognition.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // HSTS only makes sense once served over HTTPS in production.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Don't let `next dev` write an AGENTS.md into the repo.
  agentRules: false,
  poweredByHeader: false,
  // Lean, self-contained server bundle for the Docker image (see Dockerfile).
  output: "standalone",
  // Notebook PDF export drives a real Chromium process - keep these out of the
  // webpack bundle so they run as plain Node modules on every host. `katex` is
  // external too so the export route can read `katex/dist/katex.min.css` off
  // disk by its real path (Turbopack otherwise rewrites `require.resolve` to a
  // bundler-internal `[project]/…` pseudo-path). `ffmpeg-static` and
  // `@huggingface/transformers` (local dictation) need the same treatment:
  // both resolve real on-disk paths (a binary, ONNX/WASM assets) via
  // `__dirname`, which Turbopack otherwise rewrites to a placeholder and
  // breaks with `ENOENT`.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium", "isomorphic-dompurify", "katex", "ffmpeg-static", "@huggingface/transformers"],
  // Standalone output only copies what the tracer sees `import`ed - the PDF
  // route reads these files with `fs`, so name them explicitly. Local
  // dictation's ONNX Runtime backend `dlopen`s its shared libraries itself
  // (not a traceable `require()`), so the tracer misses them without this.
  outputFileTracingIncludes: {
    // Keys are globs: the brackets must be escaped, or "[id]" is a character
    // class and the rule never matches (katex.min.css was silently missing
    // from production PDF exports).
    "/api/notebooks/\\[id\\]/export-pdf": ["./node_modules/katex/dist/**"],
    // The whole package: transformers.js loads it by name at runtime, so the
    // tracer sees neither its JS entry point nor the native libraries.
    "/api/dictation/status": ["./node_modules/onnxruntime-node/**", "./node_modules/onnxruntime-common/**"],
    "/api/dictation/transcribe": ["./node_modules/onnxruntime-node/**", "./node_modules/onnxruntime-common/**"],
  },
  // Keep local working folders out of server bundles. The ./data fallback
  // paths (uploads, logs, the dictation model cache) are marked
  // /*turbopackIgnore*/ where they're built, so they aren't traced at all.
  // These patterns match anywhere in a path - "data/**" or "src/**" also
  // stripped dependencies' own folders and broke PDF export - so only
  // names that can't collide with a package's files belong here.
  outputFileTracingExcludes: {
    "/**": [
      "./prisma/pglite-data/**",
      "./mcp-server/dist/**",
      "./src/app/api/**",
      "./playwright-report/**",
      "./test-results/**",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      {
        source: "/accomplishments",
        destination: "/analytics",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
