import Link from 'next/link';
import {Plus} from 'lucide-react';
export function BrandsActions(){return <Link href="/brand-setup?new=1" className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus size={16}/>Add brand</Link>;}
