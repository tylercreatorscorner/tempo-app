import { PaymentsClient } from './payments-client';

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1A1B3A]">
          Payments
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Commission tracking, retainers, invoices, and payment history
        </p>
      </div>
      <PaymentsClient />
    </div>
  );
}
