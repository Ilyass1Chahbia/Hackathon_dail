/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The supplied records are read with fs at request time, so they must be traced into
  // the serverless bundle explicitly rather than relying on an import edge.
  outputFileTracingIncludes: { "/**": ["./source/initial.json"] },
  // A running dev server must survive `npm run build`; keep the two outputs apart.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // /api/py/* is the Python/LangGraph workflow. On Vercel it is the api/index.py
  // function; in development it is uvicorn on :8000 (see scripts/dev.sh).
  async rewrites() {
    return [
      {
        source: "/api/py/:path*",
        destination:
          process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api/py/:path*" : "/api/index",
      },
    ];
  },
};

export default nextConfig;
