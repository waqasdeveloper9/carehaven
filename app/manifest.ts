import { config } from '@/lib/config';
import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest { return { name: config.name, short_name: config.name, description: 'Care and sponsorship management', start_url: '/', display: 'standalone', background_color: '#f5f7f9', theme_color: '#23856a', icons: [{src:'/icon.svg', sizes:'any', type:'image/svg+xml', purpose:'any'}] }; }
