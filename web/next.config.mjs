/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The supplied records are read with fs at request time, so they must be traced into
  // the serverless bundle explicitly rather than relying on an import edge.
  outputFileTracingIncludes: { "/**": ["./source/initial.json"] },
  // A running dev server must survive `npm run build`; keep the two outputs apart.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
