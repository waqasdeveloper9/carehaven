'use client';
import { AuthGate } from '@/components/workspace-app';
export default function LoginPage() {
  return <AuthGate gate={{}} onReady={async()=>{window.location.assign('/');}}/>;
}
