import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | Tempo',
  description: 'Terms of Service for the Tempo platform by Drinkard Ecom LLC.',
};

const sections = [
  { id: 'service-description', label: '1. Service Description' },
  { id: 'account-registration', label: '2. Account Registration and Eligibility' },
  { id: 'subscription-billing', label: '3. Subscription and Billing' },
  { id: 'acceptable-use', label: '4. Acceptable Use' },
  { id: 'data-privacy', label: '5. Data and Privacy' },
  { id: 'intellectual-property', label: '6. Intellectual Property' },
  { id: 'limitation-liability', label: '7. Limitation of Liability' },
  { id: 'termination', label: '8. Termination' },
  { id: 'changes-to-terms', label: '9. Changes to These Terms' },
  { id: 'governing-law', label: '10. Governing Law' },
  { id: 'contact', label: '11. Contact Information' },
];

export default function TermsPage() {
  return (
    <article className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-12 space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Terms of Service</h1>
        <p className="text-sm text-gray-500">Last updated: February 2026</p>
        <p className="text-gray-700 leading-relaxed">
          Welcome to Tempo. These Terms of Service (&quot;Terms&quot;) govern your access to and use of the Tempo
          platform at <a href="https://tempoapp.ai" className="text-[#FF4D8D] hover:underline">tempoapp.ai</a> (the
          &quot;Service&quot;), operated by Drinkard Ecom LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), a
          Texas limited liability company based in Frisco, Texas. By creating an account or using the Service, you agree
          to be bound by these Terms.
        </p>
      </header>

      {/* Table of Contents */}
      <nav className="rounded-xl bg-gray-50 border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Table of Contents</h2>
        <ol className="space-y-1.5">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-sm text-gray-600 hover:text-[#FF4D8D] transition-colors">
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 1 */}
      <section id="service-description" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">1. Service Description</h2>
        <p className="text-gray-700 leading-relaxed">
          Tempo is a software-as-a-service (SaaS) platform designed for brands and agencies that sell through TikTok
          Shop. Tempo provides analytics, creator management tools, product performance tracking, and reporting
          dashboards. The Service integrates with TikTok Shop APIs to pull performance data and display it in a unified
          workspace for your team.
        </p>
        <p className="text-gray-700 leading-relaxed">
          We may update, modify, or discontinue features of the Service at any time. We will make reasonable efforts to
          notify you of significant changes that affect your use of the platform.
        </p>
      </section>

      {/* 2 */}
      <section id="account-registration" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">2. Account Registration and Eligibility</h2>
        <p className="text-gray-700 leading-relaxed">
          To use Tempo, you must create an account and provide accurate, complete information. You are responsible for
          maintaining the security of your account credentials and for all activity that occurs under your account.
        </p>
        <p className="text-gray-700 leading-relaxed">
          You must be at least 18 years old and have the legal authority to enter into these Terms on behalf of yourself
          or the organization you represent. If you are using the Service on behalf of a company or other entity, you
          represent that you have the authority to bind that entity to these Terms.
        </p>
        <p className="text-gray-700 leading-relaxed">
          You agree to notify us immediately if you become aware of any unauthorized use of your account.
        </p>
      </section>

      {/* 3 */}
      <section id="subscription-billing" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">3. Subscription and Billing</h2>
        <p className="text-gray-700 leading-relaxed">
          Tempo operates on a subscription basis with recurring billing through Stripe. When you subscribe, you
          authorize us to charge your payment method on a recurring basis (monthly or annually, depending on the plan
          you select) until you cancel.
        </p>
        <ul className="list-disc pl-6 space-y-2 text-gray-700">
          <li>
            <strong>Plan pricing</strong> is determined by your TikTok Shop monthly GMV for brand accounts, or by the
            number of brands managed for agency accounts. Plans may be reviewed and adjusted quarterly based on your
            actual usage.
          </li>
          <li>
            <strong>Annual billing</strong> offers a discounted rate compared to monthly billing. Annual subscriptions
            are billed upfront for the full year.
          </li>
          <li>
            <strong>Cancellation.</strong> You may cancel your subscription at any time through your account settings or
            by contacting us. Cancellation takes effect at the end of your current billing period. We do not provide
            prorated refunds for partial billing periods.
          </li>
          <li>
            <strong>Failed payments.</strong> If a payment fails, we may retry the charge and may suspend your access
            until the payment issue is resolved.
          </li>
          <li>
            <strong>Price changes.</strong> We reserve the right to change our pricing. We will give you at least 30
            days notice before any price increase takes effect on your account.
          </li>
        </ul>
      </section>

      {/* 4 */}
      <section id="acceptable-use" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">4. Acceptable Use</h2>
        <p className="text-gray-700 leading-relaxed">
          You agree to use the Service only for its intended purpose and in compliance with all applicable laws. You
          may not:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-gray-700">
          <li>Use the Service to violate any law, regulation, or third-party rights</li>
          <li>Attempt to gain unauthorized access to other accounts, systems, or networks connected to the Service</li>
          <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
          <li>Scrape, crawl, or use automated means to extract data from the Service beyond what the platform provides through its intended features</li>
          <li>Use the Service to compete directly with Tempo or to build a similar product</li>
          <li>Share your account credentials with unauthorized users or allow multiple people to use a single account</li>
          <li>Transmit malware, viruses, or any other harmful code through the Service</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          We reserve the right to suspend or terminate your account if we determine that your use violates these Terms
          or poses a risk to the Service or other users.
        </p>
      </section>

      {/* 5 */}
      <section id="data-privacy" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">5. Data and Privacy</h2>
        <p className="text-gray-700 leading-relaxed">
          Your privacy matters to us. Our{' '}
          <Link href="/privacy" className="text-[#FF4D8D] hover:underline font-medium">
            Privacy Policy
          </Link>{' '}
          explains what data we collect, how we use it, and how we protect it. By using the Service, you agree to the
          collection and use of your information as described in our Privacy Policy.
        </p>
        <p className="text-gray-700 leading-relaxed">
          You retain ownership of the data you provide to Tempo, including your TikTok Shop performance data. We use
          your data solely to provide and improve the Service. We do not sell your data to third parties.
        </p>
        <p className="text-gray-700 leading-relaxed">
          You are responsible for ensuring that you have the necessary rights and permissions to share any data you
          upload or connect to the Service, including data from TikTok Shop and any creator information.
        </p>
      </section>

      {/* 6 */}
      <section id="intellectual-property" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">6. Intellectual Property</h2>
        <p className="text-gray-700 leading-relaxed">
          The Service, including its design, code, features, documentation, and branding, is owned by Drinkard Ecom LLC
          and is protected by intellectual property laws. You may not copy, modify, distribute, or create derivative
          works based on the Service without our prior written consent.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Your subscription grants you a limited, non-exclusive, non-transferable license to access and use the Service
          for your internal business purposes during the term of your subscription.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Any feedback, suggestions, or ideas you provide about the Service may be used by us without restriction or
          compensation to you.
        </p>
      </section>

      {/* 7 */}
      <section id="limitation-liability" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">7. Limitation of Liability</h2>
        <p className="text-gray-700 leading-relaxed">
          To the fullest extent permitted by law, Drinkard Ecom LLC and its officers, employees, and affiliates will
          not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or
          related to your use of the Service. This includes, but is not limited to, loss of profits, data, business
          opportunities, or goodwill.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Our total liability for any claims arising under these Terms will not exceed the amount you paid to us in the
          twelve (12) months preceding the claim.
        </p>
        <p className="text-gray-700 leading-relaxed">
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether
          express or implied. We do not guarantee that the Service will be uninterrupted, error-free, or secure at all
          times.
        </p>
      </section>

      {/* 8 */}
      <section id="termination" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">8. Termination</h2>
        <p className="text-gray-700 leading-relaxed">
          You may close your account at any time by contacting us at{' '}
          <a href="mailto:support@tempoapp.ai" className="text-[#FF4D8D] hover:underline">support@tempoapp.ai</a>.
        </p>
        <p className="text-gray-700 leading-relaxed">
          We may suspend or terminate your account if you violate these Terms, fail to pay your subscription fees, or
          if we are required to do so by law. We may also terminate your account with 30 days written notice for any
          reason.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Upon termination, your right to use the Service ends immediately. We will retain your data for a reasonable
          period (typically 30 days) to allow you to export it, after which it may be permanently deleted.
        </p>
      </section>

      {/* 9 */}
      <section id="changes-to-terms" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">9. Changes to These Terms</h2>
        <p className="text-gray-700 leading-relaxed">
          We may update these Terms from time to time. When we make significant changes, we will notify you by email or
          through a notice on the Service. Your continued use of the Service after the changes take effect constitutes
          your acceptance of the updated Terms.
        </p>
        <p className="text-gray-700 leading-relaxed">
          If you do not agree with the updated Terms, you may cancel your subscription and stop using the Service before
          the changes take effect.
        </p>
      </section>

      {/* 10 */}
      <section id="governing-law" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">10. Governing Law</h2>
        <p className="text-gray-700 leading-relaxed">
          These Terms are governed by and construed in accordance with the laws of the State of Texas, United States,
          without regard to conflict of law principles. Any disputes arising from these Terms or the Service will be
          resolved in the state or federal courts located in Collin County, Texas.
        </p>
      </section>

      {/* 11 */}
      <section id="contact" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">11. Contact Information</h2>
        <p className="text-gray-700 leading-relaxed">
          If you have any questions about these Terms, please contact us:
        </p>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-5 text-sm text-gray-700 space-y-1">
          <p><strong>Drinkard Ecom LLC</strong></p>
          <p>Frisco, Texas</p>
          <p>
            Email:{' '}
            <a href="mailto:support@tempoapp.ai" className="text-[#FF4D8D] hover:underline">support@tempoapp.ai</a>
          </p>
        </div>
      </section>
    </article>
  );
}
