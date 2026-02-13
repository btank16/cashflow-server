import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - Cashflow",
  description:
    "Cashflow Software LTD. Data and Privacy Policy. Learn how we collect, use and safeguard your information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Subtle gradient wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#109C50]/10 via-transparent to-[#8FB205]/5" />
      <div className="grid-overlay pointer-events-none absolute inset-0" />

      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Link href="/">
            <Image
              src="/images/logo-white.svg"
              alt="Cashflow"
              width={140}
              height={35}
              priority
            />
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            &larr; Back to Home
          </Link>
        </div>
      </nav>

      {/* Content */}
      <div className="relative mx-auto max-w-3xl px-6 pt-28 pb-16">
        <div className="glass-card rounded-3xl p-6 sm:p-8 md:p-10">
          <h1 className="mb-2 text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            Data and Privacy Policy
          </h1>
          <p className="mb-8 text-sm text-white/30">Cashflow Software LTD.</p>

          <div className="legal-content space-y-6 text-sm leading-relaxed text-white/60">
            <p>
              Cashflow Software LTD. (&ldquo;<strong className="text-white/80">Cashflow</strong>&rdquo;) is committed to maintaining robust data and privacy protection for its customers and clients. Cashflow&rsquo;s Data &amp; Privacy Policy (&ldquo;<strong className="text-white/80">Privacy Policy</strong>&rdquo;) is designed to help you understand how we collect, use and safeguard the information you provide to us or that we collect as part of the services we provide.
            </p>

            <p>
              By entering into any contract or agreement with Cashflow and/or by using Cashflow&rsquo;s services or website, you accept the terms and conditions contained in this Privacy Policy and consent to the collection, storage, use and disclosure of your personal, non-personal and/or business information, whether such information has been provided by you or collected by Cashflow.
            </p>

            <p>
              Cashflow&rsquo;s Services are provided through its affiliated website (www.cashflow.deal), the Cashflow App, and related mobile applications and all related subdomains (collectively hereinafter referred to as &ldquo;Sites and Services&rdquo;).
            </p>

            {/* Section 1 */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">1. Information Collected</h2>

            <div className="space-y-4 pl-4">
              <div>
                <h3 className="font-semibold text-white/80">1.1 Non-Personal Information.</h3>
                <p>Cashflow collects both &ldquo;Non-Personal Information&rdquo; and &ldquo;Personal Information.&rdquo; Non-Personal Information includes information that cannot be used to personally identify you.</p>
              </div>

              <div>
                <h3 className="font-semibold text-white/80">1.2 Personal Information.</h3>
                <p>Cashflow collects &ldquo;Personal Information&rdquo; which is information provided by you directly to Cashflow or obtained by Cashflow through your use of the application or any other related applications and domains. Personal Information includes, but is not limited to, the following categories:</p>

                <div className="mt-3 space-y-3 pl-4">
                  <p>
                    <strong className="text-white/70">(a) General Personal Information.</strong> &ldquo;General Personal Information&rdquo; includes, but is not limited to, names, date of birth, email addresses, telephone numbers, telephonic recordings, chat communications, SMS messages, the state or province in which you currently reside, and other information that could be used to personally identify you or a third-party.
                  </p>
                  <p>
                    <strong className="text-white/70">(b) Account and Identity Information.</strong> Cashflow will also collect certain information required for creating an account, including, but not limited to, the state(s) and/or province(s) in which you wish to invest, and investment strategies you plan to use.
                  </p>
                  <p>
                    <strong className="text-white/70">(c) Additional Information.</strong> Cashflow may also collect certain additional data information, including, but not limited to: (i) Device Information such as browser type, operating system, and IP address and (ii) usage data including pages assessed, time spent in app, features, used, and interactions.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-white/80">1.3 Use of Information.</h3>
                <p>The information collected, whether Non-Personal or Personal, is used for the following purposes: (i) to create and manage your account; (ii) to provide and personalize our services and your experience; (iii) to communicate with you, respond to your inquiries, and provide customer support; (iv) to improve our services, develop new features, and analyze trends in user behavior; (v) to protect the security and integrity of our services and prevent fraud or other illegal activities; (vi) to send service-related notifications and updates; (vii) to comply with legal obligations and enforce our policies.</p>
              </div>
            </div>

            <p>
              You hereby consent to Cashflow&rsquo;s collection of any Personal Information provided by you directly to Cashflow or obtained by Cashflow through your use of its website or any related applications or domains.
            </p>

            {/* Section 2 */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">2. Consumer Data</h2>

            <div className="space-y-4 pl-4">
              <div>
                <h3 className="font-semibold text-white/80">2.1 Storage of Data.</h3>
                <p>All customers and/or clients of Cashflow understand and agree that Cashflow, its employees and affiliates shall have access to and the ability to store the following: (i) all phone calls; (ii) recordings of phone calls; (iii) online chats; (iv) digital recordings of audio; (v) Cashflow SMS; (vi) Cashflow ads; (vii) form completions generated via Cashflow&rsquo;s website; (viii) any other Cashflow marketing activities; (ix) any data provided to Cashflow by customers and clients; and (x) any data collected by Cashflow about customers or clients (collectively, &ldquo;Customer Data&rdquo;). All customers and clients understand, acknowledge, agree, and consent to Cashflow&rsquo;s collection, storage, use and disclosure of Customer Data and/or similar data.</p>
              </div>

              <div>
                <h3 className="font-semibold text-white/80">2.2 Disclosure of Data.</h3>
                <div className="mt-3 space-y-3 pl-4">
                  <p>
                    <strong className="text-white/70">(a) Third Parties.</strong> Cashflow shares some Customer Data with third parties who are performing services for or on behalf of Cashflow for the benefit of our customers and/or clients. The Customer Data provided to third parties is only used at the direction of Cashflow and in accordance with Cashflow&rsquo;s Privacy Policy, an agreement between Cashflow and the third party, and/or the third-party&rsquo;s data protection or privacy policy.
                  </p>
                  <p>
                    <strong className="text-white/70">(b) Outside Parties.</strong> Cashflow may also share Customer Data, including Personal Information, with outside parties if Cashflow has a good-faith belief that access, use, preservation, or disclosure of such information is reasonably necessary to comply with a Court Order or meet any applicable legal process or enforceable governmental request necessary for the investigation of potential violations, fraud, security or technical concerns, to protect against harm to the rights, property, or safety of the public as required or permitted by law, and to enforce the terms of this Privacy Policy or any contract or agreement between Cashflow and its vendors, partners, clients, or customers. This Privacy Policy does not limit in any way our use or disclosure of Non-Personal Information and Cashflow reserves the right to use and disclose such Non-Personal Information as it, in its sole discretion, desires.
                  </p>
                  <p>
                    <strong className="text-white/70">(c) Upon Merger, Acquisition, or Sale.</strong> In the event of a business transaction including, but not limited to, any merger, acquisition, or sale of assets, Customer Data may be one of the assets transferred by Cashflow. You acknowledge that such transfers may occur and are permitted by this Privacy Policy, and you consent to such a transfer. You also acknowledge and consent to the continued use of your Customer Data, as permitted in this Privacy Policy, as amended, by the party acquiring your Customer Data through such a transaction.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3 */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">3. Security</h2>
            <p>
              Cashflow takes reasonable steps to protect the Customer Data it collects and stores. Such security measures may, but do not necessarily, include: (i) the use of password protected accounts; (ii) encryption; (iii) firewalls; and (iv) other technological security measures. However, these measures do not guarantee that your Customer Data will not be accessed, disclosed, altered or destroyed by a breach of any or all of the protections that Cashflow has put in place to protect such data. Nevertheless, all customers acknowledge and agree to assume these risks.
            </p>

            {/* Section 4 */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">4. Data Collection Technologies</h2>

            <div className="space-y-4 pl-4">
              <div>
                <h3 className="font-semibold text-white/80">4.1</h3>
                <p>As you navigate through and interact with our Website and mobile application, we may use automatic data collection technologies to collect certain information about your equipment, browsing actions, and patterns including: (i) details of your visits to our Website, including traffic data, location data, logs, and other communication data and the resources that you access and use on the Website; and (ii) information about your computer and internet connection, including your IP address, operating system, and browser type.</p>
              </div>

              <div>
                <h3 className="font-semibold text-white/80">4.2</h3>
                <p>The information we collect helps us to improve our Website and mobile application and to deliver a better and more personalized service, by enabling us to: (i) estimate our audience size and usage patterns; (ii) store information about your preferences, allowing us to customize our Website according to your individual interests; (iii) speed up your searches; (iv) Recognize you when you return to our Website.</p>
              </div>

              <div>
                <h3 className="font-semibold text-white/80">4.3 Technologies Used.</h3>
                <p>The technologies we use for this automatic data collection may include:</p>

                <div className="mt-3 space-y-3 pl-4">
                  <p>
                    <strong className="text-white/70">(a) Cookies (or browser cookies).</strong> A cookie is a small file placed on a hard drive of your computer. You may refuse to accept browser cookies by activating the appropriate setting on your browser. However, if you select this setting you may be unable to access certain parts of our Website. Unless you have adjusted your browser setting so that it will refuse cookies, our system will issue cookies when you direct your browser to our Website.
                  </p>
                  <p>
                    <strong className="text-white/70">(b) Flash Cookies.</strong> Certain features of our Website may use local stored objects (or Flash cookies) to collect and store information about your preferences and navigation to, from, and on our Website. Flash cookies are not managed by the same browser settings as are used for browser cookies.
                  </p>
                  <p>
                    <strong className="text-white/70">(c) Web Beacons.</strong> Pages of our Website and our e-mails may contain small electronic files known as web beacons (also referred to as clear gifs, pixel tags, and single-pixel gifs) that permit the Company, for example, to count users who have visited those pages or opened an email and for other related website statistics (for example, recording the popularity of certain website content and verifying system and server integrity).
                  </p>
                </div>
              </div>
            </div>

            {/* Section 5 */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">5. Children&rsquo;s Privacy Policy</h2>

            <div className="space-y-4 pl-4">
              <div>
                <h3 className="font-semibold text-white/80">5.1 Children&rsquo;s Online Privacy Protection Act of 1998.</h3>
                <p>As it relates to the Children&rsquo;s Online Privacy Protection Act of 1998, Cashflow does not intend to provide services directed to children under the age of 13 or collect, use or disclose the Personal Information of children under the age of 13. Children under the age of 18 are not permitted to access and/or use Cashflow&rsquo;s services.</p>
              </div>

              <div>
                <h3 className="font-semibold text-white/80">5.2 California Residents.</h3>
                <p>California residents under 16 years of age may have additional rights regarding the collection and sale of their personal information. Please see Your California Privacy Rights for more information.</p>
              </div>
            </div>

            {/* Changes notice */}
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p>
                Cashflow reserves the right to change its Privacy Policy at any time. We will notify you of any material changes to our Privacy Policy by sending a notice to the primary email address specified in your account or by placing a prominent notice on our website. Material changes will go into effect thirty (30) days following such notification. Non-material changes or clarifications will take effect immediately. You should periodically check for any updates or changes to Cashflow&rsquo;s Privacy Policy on its website at www.cashflow.deal.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
