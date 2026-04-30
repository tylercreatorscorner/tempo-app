import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/require-admin';
import { UploadClient } from './upload-client';

export const metadata = { title: 'Upload — Tempo' };

export default async function UploadPage() {
  // Server-side gate: only owner/admin can render this page. Creators or brand
  // clients who somehow navigate here get bounced to the dashboard.
  const profile = await requireAdmin();
  if (!profile) {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1A1B3A]">Upload</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Drop your TikTok Shop XLSX exports — we'll auto-detect the file type, brand, and date.
        </p>
      </div>
      <UploadClient />
    </div>
  );
}
