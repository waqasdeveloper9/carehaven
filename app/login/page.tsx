'use client';
import { AuthGate } from '@/components/auth-gate';
export default function LoginPage() {
  return <AuthGate gate={{}} onReady={async()=>{window.location.assign('/');}}/>;
}
