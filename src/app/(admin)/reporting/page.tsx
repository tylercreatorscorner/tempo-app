'use client';

import { FileBarChart, Calendar, Download, Send, Clock, FileText, MessageSquare } from 'lucide-react';

export default function ReportingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reporting</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate reports, schedule automated summaries, and share performance updates with your team.
          </p>
        </div>
        <button className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] text-white text-sm font-medium opacity-50 cursor-not-allowed flex items-center gap-2">
          <FileText className="h-4 w-4" /> New Report
        </button>
      </div>

      {/* Report type cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <FileBarChart className="h-5 w-5 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Performance Reports</h3>
          <p className="text-sm text-gray-500">Weekly and monthly summaries of GMV, creator activity, video performance, and ROI across all brands.</p>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Calendar className="h-3.5 w-3.5" /> Schedulable
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-purple-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Discord & Slack Posts</h3>
          <p className="text-sm text-gray-500">Auto-generate formatted performance updates for your Discord or Slack channels. Daily, weekly, or custom.</p>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Send className="h-3.5 w-3.5" /> Auto-post
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
            <Download className="h-5 w-5 text-green-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Export & Share</h3>
          <p className="text-sm text-gray-500">Download PDF or CSV reports. Share branded reports with clients via email or direct link.</p>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock className="h-3.5 w-3.5" /> On-demand
          </div>
        </div>
      </div>

      {/* Coming soon */}
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-[#7C5CFC] to-[#FF4D8D] flex items-center justify-center mb-6 shadow-xl shadow-[#7C5CFC]/20">
          <FileBarChart className="h-10 w-10 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Reporting is Coming Soon</h2>
        <p className="text-gray-500 max-w-md mb-6">
          Automated performance reports, scheduled Discord/Slack posts, and exportable brand summaries. All on autopilot.
        </p>
        <div className="flex flex-wrap gap-2 justify-center max-w-lg">
          {[
            'Weekly summaries',
            'Monthly brand reports',
            'Discord auto-post',
            'Slack integration',
            'PDF export',
            'CSV download',
            'Custom date ranges',
            'Client sharing links',
            'Scheduled delivery',
          ].map((feature) => (
            <span key={feature} className="px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
