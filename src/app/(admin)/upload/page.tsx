import { UploadClient } from './upload-client';

export const metadata = { title: 'Upload — Tempo' };

export default function UploadPage() {
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
