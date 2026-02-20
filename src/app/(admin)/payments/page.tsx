import { CreditCard, Clock, FileText, ArrowUpRight } from 'lucide-react';

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1B3A]">
          Payments
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Commission tracking and creator payouts
        </p>
      </div>

      {/* Coming Soon Card */}
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-pink-50 flex items-center justify-center mb-4">
          <CreditCard className="h-8 w-8 text-[#FF4D8D]" />
        </div>
        <h2 className="text-xl font-bold text-[#1A1B3A] mb-2">Payments Coming Soon</h2>
        <p className="text-gray-500 max-w-md mx-auto mb-8">
          We&apos;re building a complete payment management system for tracking commissions, 
          creator payouts, and financial reporting &mdash; all in one place.
        </p>

        {/* Feature Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-left">
            <div className="h-9 w-9 rounded-lg bg-green-50 flex items-center justify-center mb-3">
              <ArrowUpRight className="h-4 w-4 text-green-600" />
            </div>
            <h3 className="text-sm font-semibold text-[#1A1B3A] mb-1">Commission Tracking</h3>
            <p className="text-xs text-gray-500">
              Real-time commission calculations per creator, product, and brand
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-left">
            <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
              <Clock className="h-4 w-4 text-blue-500" />
            </div>
            <h3 className="text-sm font-semibold text-[#1A1B3A] mb-1">Payout Scheduling</h3>
            <p className="text-xs text-gray-500">
              Automated payout cycles with approval workflows
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 text-left">
            <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center mb-3">
              <FileText className="h-4 w-4 text-purple-500" />
            </div>
            <h3 className="text-sm font-semibold text-[#1A1B3A] mb-1">Financial Reports</h3>
            <p className="text-xs text-gray-500">
              Export-ready reports for accounting and tax purposes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
