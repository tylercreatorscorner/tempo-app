import { CreditCard, Clock, FileText, ArrowUpRight } from 'lucide-react';

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          Payments
        </h1>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Commission tracking and creator payouts
        </p>
      </div>

      {/* Coming Soon Card */}
      <div className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.2)] p-8 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
          <CreditCard className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Payments Coming Soon</h2>
        <p className="text-muted-foreground/60 max-w-md mx-auto mb-8">
          We&apos;re building a complete payment management system for tracking commissions, 
          creator payouts, and financial reporting — all in one place.
        </p>

        {/* Feature Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 text-left">
            <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center mb-3">
              <ArrowUpRight className="h-4 w-4 text-green-400" />
            </div>
            <h3 className="text-sm font-semibold text-white/80 mb-1">Commission Tracking</h3>
            <p className="text-xs text-muted-foreground/50">
              Real-time commission calculations per creator, product, and brand
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 text-left">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
              <Clock className="h-4 w-4 text-blue-400" />
            </div>
            <h3 className="text-sm font-semibold text-white/80 mb-1">Payout Scheduling</h3>
            <p className="text-xs text-muted-foreground/50">
              Automated payout cycles with approval workflows
            </p>
          </div>
          <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4 text-left">
            <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3">
              <FileText className="h-4 w-4 text-purple-400" />
            </div>
            <h3 className="text-sm font-semibold text-white/80 mb-1">Financial Reports</h3>
            <p className="text-xs text-muted-foreground/50">
              Export-ready reports for accounting and tax purposes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
