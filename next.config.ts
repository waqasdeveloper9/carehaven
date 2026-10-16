import type { NextConfig } from 'next';
const config: NextConfig = { experimental: { cpus: Math.max(1,Math.min(8,Number(process.env.BUILD_WORKER_COUNT)||2)) }, poweredByHeader: false, async headers() { return [{ source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'DENY' }] }]; } };
export default config;
