'use client';
import { useBrandMeta } from '@/hooks/use-brand-meta';
import { BrandPortrait } from './brand-portrait';
export function BrandIdentity({brand,label}:{brand:string;label:string}) {
 const meta=useBrandMeta();
 return <span className="inline-flex items-center gap-2.5"><BrandPortrait name={label} source={meta.logo(brand)} color={meta.color(brand)} size={28}/><span>{label}</span></span>;
}
