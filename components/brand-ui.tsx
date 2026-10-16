'use client';
import { useState } from 'react';
import { ArrowRight, Heart, Leaf, ShieldCheck } from 'lucide-react';
import { brand, demoPortraitPositions } from '@/lib/brand';
import { config, money } from '@/lib/config';
import { categories } from '@/lib/config';
import type { Child, Entry } from '@/lib/types';
import { Button } from './ui/button';

export function BrandMark({ className = '' }: { className?: string }) {
  return <span className={`brand-mark ${className}`} aria-hidden="true"><Heart strokeWidth={1.8}/><Leaf className="brand-leaf" strokeWidth={2.2}/></span>;
}

export function CareHero({ donor, onExplore }: { donor: boolean; onExplore: () => void }) {
  return <section className="care-hero" aria-labelledby="care-hero-title">
    <div className="care-hero-copy"><span className="eyebrow">CARE TODAY. POSSIBILITY TOMORROW.</span>
      <h2 id="care-hero-title">{donor ? <>Your kindness.<br/>Their brighter tomorrow.</> : <>Every child deserves<br/>a brighter tomorrow.</>}</h2>
      <p>{donor ? 'See the difference your support makes, one contribution at a time.' : 'A clear view of your care, sponsorships, and contributions.'}</p>
      <Button onClick={onExplore}>{donor ? 'Explore your sponsorships' : 'Meet the children in our care'}<ArrowRight size={16}/></Button>
    </div>
    <div className="care-hero-art" aria-hidden="true"><img src={brand.careImage} alt=""/><span className="hero-blush"/><Leaf className="hero-leaf"/><span className="hero-handwriting">Caring.<br/>Learning.<br/>Growing together.<Heart size={20}/></span></div>
  </section>;
}

export function ChildPortrait({child, demo, className = ''}: {child: Child; demo: boolean; className?: string}) {
  const [failed, setFailed] = useState('');
  const position = demo ? demoPortraitPositions[child.id] : undefined;
  if(position && !child.picture_url) return <span className={`child-portrait demo-portrait ${className}`} role="img" aria-label={`Illustrative demo portrait for ${child.full_name}`} style={{backgroundImage:`url("${brand.demoPortraits}")`, backgroundPosition:position}}/>;
  if(child.picture_url && failed!==child.picture_url) return <img className={`child-portrait ${className}`} src={demo && /^data:image\/(jpeg|png|webp);base64,/.test(child.picture_url)?child.picture_url:`/api/files?kind=photo&path=${encodeURIComponent(child.picture_url)}`} alt={`${child.full_name}'s profile`} onError={()=>setFailed(child.picture_url!)} loading="lazy"/>;
  return <span className={`child-portrait portrait-initials ${className}`} aria-label={`Profile initials for ${child.full_name}`}>{child.full_name.split(' ').map(n=>n[0]).slice(0,2).join('')}<Leaf aria-hidden="true"/></span>;
}

export function MonthlyCareChart({entries}: {entries: Entry[]}) {
  const current = new Date();
  const localParts = new Intl.DateTimeFormat('en-US', { year:'numeric', month:'numeric', timeZone:config.timezone }).formatToParts(current);
  const year = Number(localParts.find(p=>p.type==='year')?.value);
  const month = Number(localParts.find(p=>p.type==='month')?.value) - 1;
  const rows = Array.from({length:brand.chartMonths}, (_,i)=>{
    const date = new Date(Date.UTC(year,month-brand.chartMonths+1+i,15));
    const key = date.toISOString().slice(0,7);
    const relevant = entries.filter(e=>{
      const parts=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',timeZone:config.timezone}).formatToParts(new Date(e.created_at));
      return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`===key;
    });
    return {key,label:new Intl.DateTimeFormat(config.locale,{month:'short',timeZone:'UTC'}).format(date),received:relevant.reduce((n,e)=>n+Number(e.amount_in),0),spent:relevant.reduce((n,e)=>n+Number(e.amount_out),0)};
  });
  const maximum = Math.max(...rows.flatMap(r=>[r.received,r.spent]),1);
  return <div className="monthly-chart"><div className="chart-legend"><span><i/>Contributions</span><span><i/>Care expenses</span></div><div className="chart-plot"><div className="chart-axis" aria-hidden="true">{[1,.5,0].map(n=><span key={n}>{new Intl.NumberFormat(config.locale,{notation:'compact',maximumFractionDigits:1}).format(maximum*n)}</span>)}</div><div className="chart-bars">{rows.map(row=><div className="chart-month" key={row.key}><div className="chart-bar-pair" role="img" aria-label={`${row.label}: contributions ${money(row.received)}, care expenses ${money(row.spent)}`}><span className="chart-bar received" style={{height:`${row.received/maximum*100}%`}} title={`Contributions: ${money(row.received)}`}/><span className="chart-bar spent" style={{height:`${row.spent/maximum*100}%`}} title={`Care expenses: ${money(row.spent)}`}/></div><span className="chart-month-label">{row.label}</span></div>)}</div></div><p className="chart-caption">{config.currency} · Actual ledger totals for the last {brand.chartMonths} months</p></div>;
}

export function AuthStory() {
  return <aside className="auth-story"><div className="auth-story-brand"><BrandMark/><strong>{config.name}</strong></div><div className="auth-story-image"><img src={brand.careImage} alt="Illustrative artwork of a caregiver and children reading together"/><span className="auth-image-label">A little care. A lasting impact.</span></div><div className="auth-story-copy"><span className="eyebrow">TOGETHER, WE CREATE POSSIBILITY</span><h2>Every child deserves<br/>a brighter tomorrow.</h2><p>Thoughtful care, meaningful sponsorships, and transparent records. All connected in one place.</p></div><div className="auth-story-trust"><ShieldCheck size={20}/><span>Care with accountability.<small>Built around people. Grounded in trust.</small></span></div></aside>;
}

export function SpendingBreakdown({entries}: {entries:Entry[]}) {
  const total=entries.reduce((n,e)=>n+Number(e.amount_out),0);
  const breakdown=categories.map((name,i)=>({name,color:brand.categoryColors[i%brand.categoryColors.length],amount:entries.filter(e=>e.category===name).reduce((n,e)=>n+Number(e.amount_out),0)})).filter(row=>row.amount>0);
  let offset=0;
  const stops=breakdown.map(row=>{const start=offset;offset+=total?row.amount/total*100:0;return `${row.color} ${start}% ${offset}%`;});
  return <section className="panel spending-breakdown"><div className="panel-heading"><div><h2>Where your support goes</h2><p>Every contribution has a story. Every expense has a record.</p></div><ShieldCheck size={22}/></div><div className="impact-content"><div className="donut" style={{background:stops.length?`conic-gradient(${stops.join(',')})`:'var(--mint)'}}><div><small>Total care expenses</small><strong>{money(total)}</strong><span>Accountable, everyday care</span></div></div><div className="category-list">{breakdown.length?breakdown.map(row=><div key={row.name}><span className="category-dot" style={{background:row.color}}/><span>{row.name}<small>{Math.round(row.amount/total*1000)/10}% of care expenses</small></span><strong>{money(row.amount)}</strong></div>):<p className="muted">Your care expense breakdown will appear here once spending is recorded.</p>}</div></div></section>;
}
