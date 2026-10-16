'use client';
import { AuthGate } from '@/components/auth-gate';
export default function ForgotPasswordPage(){return <AuthGate gate={{}} initialMode="forgot" onReady={async()=>{window.location.assign('/');}}/>;}
