'use client';

import { useState, useCallback, useRef } from 'react';
import { X, Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ParsedRow {
  creator_handle: string;
  creator_name?: string;
  retainer_amount?: string;
  start_date?: string;
}

interface BulkUploadModalProps {
  tenantId: string;
  brandId?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] || '';
    });
    return row;
  });

  return { headers, rows };
}

export function BulkUploadModal({ tenantId, brandId, onClose, onSuccess }: BulkUploadModalProps) {
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ inserted: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError('');
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCSV(text);

      if (!headers.includes('creator_handle')) {
        setError('CSV must have a "creator_handle" column');
        setParsed([]);
        return;
      }

      const mapped: ParsedRow[] = rows
        .filter((r) => r.creator_handle?.trim())
        .map((r) => ({
          creator_handle: r.creator_handle.replace(/^@/, ''),
          creator_name: r.creator_name || undefined,
          retainer_amount: r.retainer_amount || undefined,
          start_date: r.start_date || undefined,
        }));

      setParsed(mapped);
    };
    reader.readAsText(file);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUpload = async () => {
    setUploading(true);
    setError('');

    try {
      const res = await fetch('/api/roster/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          brand_id: brandId,
          creators: parsed,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
        return;
      }

      setResult({ inserted: data.inserted, total: data.total });
      onSuccess();
    } catch {
      setError('Network error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[#E91E8C]" />
            <h2 className="text-lg font-bold text-[#1A1B3A]">Bulk Upload Creators</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-xl px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Added {result.inserted} of {result.total} creators to roster
            </div>
          )}

          {/* Drop zone */}
          {parsed.length === 0 && !result && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-[#E91E8C] bg-pink-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-[#1A1B3A]">Drop CSV file here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">
                Required column: creator_handle. Optional: creator_name, retainer_amount, start_date
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          )}

          {/* Preview table */}
          {parsed.length > 0 && !result && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-[#1A1B3A]">{fileName}</span> — {parsed.length} creators found
                </p>
                <button
                  onClick={() => { setParsed([]); setFileName(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Handle</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Retainer</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Start Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {parsed.slice(0, 50).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-[#1A1B3A]">@{row.creator_handle}</td>
                          <td className="px-4 py-2 text-gray-500">{row.creator_name || '—'}</td>
                          <td className="px-4 py-2 text-gray-500">{row.retainer_amount ? `$${row.retainer_amount}` : '—'}</td>
                          <td className="px-4 py-2 text-gray-500">{row.start_date || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.length > 50 && (
                  <p className="text-xs text-gray-400 px-4 py-2 bg-gray-50">
                    Showing first 50 of {parsed.length} rows
                  </p>
                )}
              </div>

              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#E91E8C] rounded-xl hover:bg-[#d4177d] transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload {parsed.length} Creators
              </button>
            </>
          )}

          {result && (
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
