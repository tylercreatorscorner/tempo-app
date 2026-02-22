'use client';

import { Download } from 'lucide-react';
import { downloadCsv } from '@/lib/utils/export';

interface Props {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}

export function CsvExportButton({ filename, headers, rows }: Props) {
  return (
    <button
      onClick={() => downloadCsv(filename, headers, rows)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-[#FF4D8D] bg-gray-50 hover:bg-pink-50 border border-gray-200 rounded-lg transition-colors duration-200"
    >
      <Download className="h-3.5 w-3.5" />
      Download CSV
    </button>
  );
}
