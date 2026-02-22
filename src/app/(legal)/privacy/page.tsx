import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Tempo',
  description: 'Privacy Policy for the Tempo platform by Drinkard Ecom LLC.',
};

const sections = [
  { id: 'data-we-collect', label: '1. Data We Collect' },
  { id: 'how-we-use', label: '2. How We Use Your Data' },
  { id: 'data-sharing', label: '3. Data Sharing' },
  { id: 'tiktok-data', label: '4. TikTok Shop Data' },
  { id: 'creator-data', label: '5. Creator Data' },
  { id: 'cookies', label: '6. Cookies and Tracking' },
  { id: 'retention', label: '7. Data Retention and Deletion' },
  { id: 'security', label: '8. Security' },
  { id: 'children', label: '9. Children\'s Privacy' },
  { id: 'ccpa', label: '10. California Privacy Rights (CCPA)' },
  { id: 'changes', label: '11. Changes to This Policy' },
  { id: 'contact', label: '12. Contact Information' },
];

export default function PrivacyPage() {
  return (
    <article className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 sm:p-12 space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: February 2026</p>
        <p className="text-gray-700 leading-relaxed">
          This Privacy Policy explains how Drinkard Ecom LLC (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;)
          collects, uses, and protects your information when you use the Tempo platform at{' '}
          <a href="https://tempoapp.ai" className="text-[#FF4D8D] hover:underline">tempoapp.ai</a> (the
          &quot;Service&quot;). We are committed to protecting your privacy and being transparent about our data
          practices.
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
      <section id="data-we-collect" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">1. Data We Collect</h2>
        <p className="text-gray-700 leading-relaxed">We collect the following types of information:</p>

        <h3 className="text-base font-semibold text-gray-800 mt-4">Account Information</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>Your name, email address, and company name (provided during registration)</li>
          <li>Your role (brand or agency) and organization details</li>
          <li>Billing information processed through Stripe (we do not store full payment card details)</li>
        </ul>

        <h3 className="text-base font-semibold text-gray-800 mt-4">TikTok Shop Data</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>Shop performance metrics including GMV, sales volume, and revenue data</li>
          <li>Product listings and performance analytics</li>
          <li>Creator and affiliate performance data</li>
          <li>Video and content performance metrics</li>
        </ul>

        <h3 className="text-base font-semibold text-gray-800 mt-4">Usage Data</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>How you interact with the Service, including pages visited and features used</li>
          <li>Device and browser information</li>
          <li>IP address and general location data</li>
          <li>Log data such as access times and error reports</li>
        </ul>
      </section>

      {/* 2 */}
      <section id="how-we-use" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">2. How We Use Your Data</h2>
        <p className="text-gray-700 leading-relaxed">We use the information we collect to:</p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>Provide, maintain, and improve the Service</li>
          <li>Display your TikTok Shop analytics and performance dashboards</li>
          <li>Determine your subscription tier based on your shop performance</li>
          <li>Process payments and manage your subscription</li>
          <li>Send you important updates about the Service, including billing notifications and feature announcements</li>
          <li>Respond to your support requests and communications</li>
          <li>Analyze usage patterns to improve the product experience</li>
          <li>Detect and prevent fraud, abuse, or security issues</li>
          <li>Comply with legal obligations</li>
        </ul>
      </section>

      {/* 3 */}
      <section id="data-sharing" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">3. Data Sharing</h2>
        <p className="text-gray-700 leading-relaxed">
          <strong>We do not sell your personal data.</strong> We only share your information with third parties in the
          following limited circumstances:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-gray-700">
          <li>
            <strong>Service providers.</strong> We use trusted third-party services to operate the platform, including
            Stripe (payment processing), Supabase (database and authentication), and Vercel (hosting and
            infrastructure). These providers only access the data they need to perform their services and are bound by
            their own privacy policies.
          </li>
          <li>
            <strong>Legal requirements.</strong> We may disclose your information if required by law, subpoena, court
            order, or government request.
          </li>
          <li>
            <strong>Business transfers.</strong> If Drinkard Ecom LLC is involved in a merger, acquisition, or sale of
            assets, your data may be transferred as part of that transaction. We will notify you before your data
            becomes subject to a different privacy policy.
          </li>
          <li>
            <strong>With your consent.</strong> We may share your information in other ways if you explicitly ask us to
            or give us permission.
          </li>
        </ul>
      </section>

      {/* 4 */}
      <section id="tiktok-data" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">4. TikTok Shop Data</h2>
        <p className="text-gray-700 leading-relaxed">
          When you connect your TikTok Shop account to Tempo, we access your shop data through the TikTok Shop API
          with <strong>read-only permissions</strong>. We never modify, post to, or take actions on your TikTok Shop
          account.
        </p>
        <p className="text-gray-700 leading-relaxed">Specifically, we pull:</p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>Sales and revenue data (GMV, orders, commissions)</li>
          <li>Product catalog and performance metrics</li>
          <li>Creator and affiliate activity and earnings</li>
          <li>Video content performance data (views, engagement, conversions)</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          This data is stored securely in our database and is isolated per tenant. Your TikTok Shop data is never
          shared with other Tempo users or customers. You can disconnect your TikTok Shop account at any time through
          your account settings.
        </p>
      </section>

      {/* 5 */}
      <section id="creator-data" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">5. Creator Data</h2>
        <p className="text-gray-700 leading-relaxed">
          Tempo allows brands and agencies to manage creator relationships. When creators sign up through invite links,
          we collect basic information they provide, such as their name, email, social handles, and content preferences.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Creator data is associated with the brand or agency that invited them. Creators can request access to,
          correction of, or deletion of their data by contacting us at{' '}
          <a href="mailto:privacy@tempoapp.ai" className="text-[#FF4D8D] hover:underline">privacy@tempoapp.ai</a>.
        </p>
      </section>

      {/* 6 */}
      <section id="cookies" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">6. Cookies and Tracking</h2>
        <p className="text-gray-700 leading-relaxed">We use cookies and similar technologies to:</p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>Keep you signed in to your account</li>
          <li>Remember your preferences and settings</li>
          <li>Understand how you use the Service so we can improve it</li>
          <li>Ensure the security of your session</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          We may use analytics tools (such as privacy-focused analytics) to understand usage patterns. We do not use
          cookies for advertising or cross-site tracking purposes.
        </p>
        <p className="text-gray-700 leading-relaxed">
          You can control cookies through your browser settings. Disabling certain cookies may affect the functionality
          of the Service.
        </p>
      </section>

      {/* 7 */}
      <section id="retention" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">7. Data Retention and Deletion</h2>
        <p className="text-gray-700 leading-relaxed">
          We retain your data for as long as your account is active or as needed to provide the Service. If you cancel
          your subscription, we retain your data for 30 days to allow you to reactivate or export your information.
          After that period, your data will be permanently deleted from our systems.
        </p>
        <p className="text-gray-700 leading-relaxed">
          You can request immediate deletion of your data at any time by contacting us at{' '}
          <a href="mailto:privacy@tempoapp.ai" className="text-[#FF4D8D] hover:underline">privacy@tempoapp.ai</a>.
          We will process your request within 30 days.
        </p>
        <p className="text-gray-700 leading-relaxed">
          Some data may be retained longer if required by law or for legitimate business purposes such as fraud
          prevention or financial record-keeping.
        </p>
      </section>

      {/* 8 */}
      <section id="security" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">8. Security</h2>
        <p className="text-gray-700 leading-relaxed">
          We take the security of your data seriously and implement industry-standard measures to protect it, including:
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>Encryption of data in transit (TLS/HTTPS) and at rest</li>
          <li>Tenant-level data isolation so your data is never mixed with other customers</li>
          <li>Row-level security policies in our database</li>
          <li>Regular security reviews and monitoring</li>
          <li>Restricted access to production systems</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          While we work hard to protect your data, no method of transmission or storage is 100% secure. If you discover
          a security vulnerability, please report it to{' '}
          <a href="mailto:privacy@tempoapp.ai" className="text-[#FF4D8D] hover:underline">privacy@tempoapp.ai</a>.
        </p>
      </section>

      {/* 9 */}
      <section id="children" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">9. Children&apos;s Privacy</h2>
        <p className="text-gray-700 leading-relaxed">
          Tempo is not intended for use by anyone under the age of 13. We do not knowingly collect personal information
          from children under 13. If we learn that we have collected data from a child under 13, we will delete it
          promptly. If you believe a child under 13 has provided us with personal information, please contact us at{' '}
          <a href="mailto:privacy@tempoapp.ai" className="text-[#FF4D8D] hover:underline">privacy@tempoapp.ai</a>.
        </p>
      </section>

      {/* 10 */}
      <section id="ccpa" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">10. California Privacy Rights (CCPA)</h2>
        <p className="text-gray-700 leading-relaxed">
          If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li><strong>Right to know.</strong> You can request details about the personal information we collect and how we use it.</li>
          <li><strong>Right to delete.</strong> You can request that we delete your personal information, subject to certain exceptions.</li>
          <li><strong>Right to opt out of sale.</strong> We do not sell your personal information, so there is nothing to opt out of.</li>
          <li><strong>Right to non-discrimination.</strong> We will not discriminate against you for exercising your privacy rights.</li>
        </ul>
        <p className="text-gray-700 leading-relaxed">
          To exercise any of these rights, please contact us at{' '}
          <a href="mailto:privacy@tempoapp.ai" className="text-[#FF4D8D] hover:underline">privacy@tempoapp.ai</a>.
          We will respond within 45 days as required by law.
        </p>
      </section>

      {/* 11 */}
      <section id="changes" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">11. Changes to This Policy</h2>
        <p className="text-gray-700 leading-relaxed">
          We may update this Privacy Policy from time to time. When we make significant changes, we will notify you by
          email or through a notice on the Service. We encourage you to review this page periodically to stay informed
          about our data practices.
        </p>
      </section>

      {/* 12 */}
      <section id="contact" className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">12. Contact Information</h2>
        <p className="text-gray-700 leading-relaxed">
          If you have any questions about this Privacy Policy or our data practices, please contact us:
        </p>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-5 text-sm text-gray-700 space-y-1">
          <p><strong>Drinkard Ecom LLC</strong></p>
          <p>Frisco, Texas</p>
          <p>
            Email:{' '}
            <a href="mailto:privacy@tempoapp.ai" className="text-[#FF4D8D] hover:underline">privacy@tempoapp.ai</a>
          </p>
        </div>
      </section>
    </article>
  );
}
