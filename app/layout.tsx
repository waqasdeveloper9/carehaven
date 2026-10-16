import type { Metadata, Viewport } from 'next';
import { config } from '@/lib/config';
import './globals.css';
export const metadata: Metadata = { title: config.name, description: 'Sponsorship, care, and accountable financial management.', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, title: config.name } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#23856a' };
export default function Layout({children}: {children: React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
