import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use - Cashflow",
  description:
    "Cashflow Software LTD. Terms of Use. Read the terms and conditions for using Cashflow services.",
};

export default function TermsOfUsePage() {
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
            Terms of Use
          </h1>
          <p className="mb-4 text-sm text-white/30">Cashflow Software LTD.</p>
          <p className="mb-8 text-sm text-white/40">Last modified: May 14, 2025</p>

          <div className="legal-content space-y-6 text-sm leading-relaxed text-white/60">
            {/* Important Notice */}
            <div className="rounded-2xl border border-[#CE7534]/20 bg-[#CE7534]/5 p-5">
              <p className="font-semibold text-white/80">
                IMPORTANT NOTICE: THIS AGREEMENT IS SUBJECT TO BINDING ARBITRATION AND A WAIVER OF CLASS ACTION RIGHTS AS DETAILED IN SECTION XIII.
              </p>
            </div>

            <p>
              Thank you for choosing Cashflow Software LTD. (&ldquo;<strong className="text-white/80">Cashflow</strong>&rdquo;). By using Cashflow&rsquo;s services and resources, you agree to these &ldquo;<strong className="text-white/80">Terms of Use</strong>.&rdquo; If you disagree with any of the terms below, Cashflow does not grant you a license to use any of Cashflow&rsquo;s services, applications, systems, website, resources or other offerings (collectively, &ldquo;Services&rdquo; and individually a &ldquo;Service&rdquo;).
            </p>

            <p>
              Cashflow reserves the right to update and change, from time to time, these Terms of Use and all documents incorporated by reference. You can always find the most recent version of these Terms of Use at www.cashflow.deal. Cashflow may change these Terms of Use by posting a new version without notice to you. Use of Cashflow after such change constitutes acceptance of such changes.
            </p>

            <p className="font-semibold text-white/70">
              THE USE OF ANY CASHFLOW SERVICE WILL CONSTITUTE ACCEPTANCE OF THIS AGREEMENT. IF YOU DO NOT AGREE TO ABIDE BY THE ABOVE, PLEASE DO NOT UTILIZE CASHFLOW SERVICES.
            </p>

            <p>
              Cashflow Software LTD., an Ohio limited liability company, provides a variety of services and features to assist users with entering values relevant to real estate investments and generating related calculations and budgeting outputs (&ldquo;<strong className="text-white/80">Services</strong>&rdquo;). Some inputs to the calculations may be retrieved from external databases or calculated by the Cashflow&rsquo;s internal algorithms. The Cashflow Services are provided through its website www.cashflow.deal, related mobile applications and subdomains (collectively, &ldquo;<strong className="text-white/80">Sites</strong>&rdquo; and individually a &ldquo;<strong className="text-white/80">Site</strong>&rdquo;).
            </p>

            {/* Section I */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">I. Definitions</h2>
            <p>The following terms as used in this Terms of Use should be defined as follows:</p>
            <div className="space-y-3 pl-4">
              <p><strong className="text-white/70">A. Website:</strong> &ldquo;Website&rdquo; refers to the online platform operated by Cashflow Software LTD., accessible at www.cashflow.deal, which provides services related to real estate investment calculations.</p>
              <p><strong className="text-white/70">B. User:</strong> &ldquo;User&rdquo; means any individual who accesses or uses the Website and Cashflow&rsquo;s Services.</p>
              <p><strong className="text-white/70">C. Content:</strong> &ldquo;Content&rdquo; refers to all information, data, text, images, videos, or materials available on the website, whether provided by Cashflow, its users, or third parties.</p>
              <p><strong className="text-white/70">D. Account:</strong> &ldquo;Account&rdquo; represents a user&rsquo;s personal profile or dashboard on the website, which includes the user&rsquo;s first and last name, email address, date of birth, home state, target investment state(s), and investment strategy.</p>
              <p><strong className="text-white/70">E. Real Estate:</strong> &ldquo;Real Estate&rdquo; means any property consisting of land or buildings.</p>
            </div>

            {/* Section II */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">II. Licensed Uses and Restrictions</h2>
            <p>
              Cashflow Software LTD. agrees to license to you, on a worldwide, unless prohibited by law, non-exclusive, non-sublicensable basis on the terms and conditions set forth herein. These Terms of Use define legal use of the Cashflow&rsquo;s Services, all updates, revisions, substitutions, and any copies made by or for you. All rights not expressly granted to you are reserved by Cashflow.
            </p>

            <div className="space-y-4 pl-4">
              <p><strong className="text-white/70">A.</strong> Subject to the restrictions set forth in these Terms of Use, you may use Services and any updates provided by Cashflow (in its sole discretion). Your license to use the Services under these Terms of Use continues until it is terminated by either party. You acknowledge that from time-to-time technical trouble issues may occur. Cashflow will use reasonable business efforts to correct such issues. You may terminate the license by discontinuing use of all of the Services. Cashflow may terminate the license at any time for any reason. These Terms of Use terminate automatically if (i) you violate any term of these Terms of Use, (ii) Cashflow publicly posts a written notice of termination on Cashflow&rsquo;s website, (iii) Cashflow sends a written notice of termination to you, or (iv) Cashflow ceases providing access to Services to you.</p>

              <p><strong className="text-white/70">B.</strong> You agree to provide, maintain and update true, accurate, current and complete information about yourself as requested by Cashflow upon signing up. If you provide any information that does not satisfy this provision, or Cashflow has reasonable grounds to suspect as much, Cashflow has the right to suspend or terminate your access to Services and refuse your access to any and all current or future use of the Services. You also agree (a) to promptly notify Cashflow at support@cashflow.deal of any unauthorized use of the Services that you become aware of within three (3) business days. Cashflow explicitly disclaims liability for any and all losses and damages arising from your failure to comply with this section and/or any unauthorized use of the Services.</p>

              <p><strong className="text-white/70">C.</strong> You understand that there may be fees for use of the Cashflow Services and licensing fees. You agree that you shall submit payment for these fees and any other fees imposed by Cashflow, in Cashflow&rsquo;s sole discretion. The amount of a fee may change from time to time in Cashflow&rsquo;s sole discretion, effective immediately upon posting. You understand and agree that programmatic methods intended to subvert a fee are considered a violation of these Terms of Use.</p>

              <p><strong className="text-white/70">D.</strong> To use Cashflow Services, you must agree to these Terms of Use.</p>

              <div>
                <p className="font-semibold text-white/70">E. YOU SHALL NOT:</p>
                <div className="mt-3 space-y-3 pl-4">
                  <p><strong className="text-white/70">1.</strong> Use the Services in connection with or to promote any products, services, or materials that constitute, promote or are used primarily for the purpose of dealing in: spyware, adware, or other malicious programs or code, counterfeit goods, items subject to US embargo, hate materials (e.g. Nazi memorabilia), goods made from protected animal/plant species, recalled goods, hacking/surveillance/interception/descrambling equipment, cigarettes, illegal drugs and paraphernalia, unlicensed sale of prescription drugs and medical devices, pornography, prostitution, body parts and bodily fluids, stolen products and items used for theft, fireworks, explosives, and hazardous materials, government IDs, police items, unlicensed trade or dealing in stocks and securities, gambling items, professional services regulated by state licensing regimes, non-transferable items, non-packaged food items, weapons and accessories;</p>

                  <p><strong className="text-white/70">2.</strong> Use the Services in connection with any commercial activity, or in connection with any materials, website, or application which is unlawful, harmful, threatening, abusive, harassing, tortious, defamatory, vulgar, obscene, libelous, invasive of another&rsquo;s privacy, hateful, or racially, ethnically or otherwise objectionable, or which advertises for a product or service which is unlawful, harmful, threatening, abusive, harassing, tortious, defamatory, vulgar, obscene, libelous, invasive of another&rsquo;s privacy, hateful, or racially, ethnically or otherwise objectionable;</p>

                  <p><strong className="text-white/70">3.</strong> Use the Services in any manner or for any purpose that violates any law or regulation, any right of any person, including but not limited to intellectual property rights, rights of privacy, or rights of personality, or in any manner inconsistent with these Terms of Use;</p>

                  <p><strong className="text-white/70">4.</strong> Sell, lease, or sublicense the Services or access thereto without Cashflow&rsquo;s prior, express, written permission;</p>

                  <p><strong className="text-white/70">5.</strong> Use the Services in a manner that exceeds reasonable request volume, constitutes excessive or abusive usage, or otherwise fails to comply or is inconsistent with any part of these Terms of Use;</p>

                  <p><strong className="text-white/70">6.</strong> Reverse engineer, decompile, or otherwise separate the content contained within any Service; or</p>

                  <p><strong className="text-white/70">7.</strong> Use a Service in any manner that competes with products or services offered by Cashflow.</p>
                </div>
              </div>

              <p><strong className="text-white/70">F.</strong> If you wish to use the Services in any manner or for any purpose inconsistent with these Terms of Use, you may do so only by obtaining Cashflow&rsquo;s prior written authorization, which may be granted or denied in Cashflow&rsquo;s sole discretion. To request such authorization, email us at support@cashflow.deal.</p>
            </div>

            {/* Section III */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">III. Accounts and Personal Information</h2>
            <p>
              Cashflow requires you to create an account to use its services. During the account registration process, you will be asked to provide certain personal and investment-related information, including, but not limited to: (i) your first and last name; (ii) your email address; (iii) your date of birth, (iv) the state or province in which you live; (v) the state(s) or province(s) in which you wish to invest; (vi) the investment strategies you plan to use. You must be 18 years or older to register for an account of any type, absent consent from a parent or legal guardian.
            </p>
            <p>
              In agreeing to these Terms of Use, you agree to provide accurate, current, and complete information, and to update such information as necessary to keep it accurate and complete. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account.
            </p>
            <p>
              Cashflow reserves the right to suspend or terminate your account if we suspect that any information provided is inaccurate, misleading, or fraudulent, or if you violate any part of these terms.
            </p>
            <p>
              By registering for Cashflow, you agree to Cashflow&rsquo;s use of your personal information as described in Cashflow&rsquo;s Privacy Policy, located at www.cashflow.deal. For more information, please see Cashflow&rsquo;s <Link href="/privacy" className="text-[#0891B2] underline transition hover:text-[#0891B2]/80">Privacy Policy</Link>.
            </p>

            {/* Section IV */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">IV. Ownership and Relationship of Parties</h2>
            <p>
              The Services may be protected by copyrights, trademarks, service marks, international treaties, and/or other proprietary rights and laws of the U.S. and other countries. Cashflow&rsquo;s rights apply to the Services and all output and executables of the Services, excluding any software components developed by you which do not themselves incorporate the Services or any output or executables of the Services. You agree to abide by all applicable proprietary rights laws and other laws, as well as any additional copyright notices or restrictions contained in these Terms of Use. Cashflow owns all rights, title, and interest in and to the Services. These Terms of Use grant you no right, title, or interest in any intellectual property owned or licensed by Cashflow, including (but not limited to) the Services and Cashflow&rsquo;s trademarks.
            </p>

            {/* Section V */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">V. Support</h2>
            <p>
              Cashflow may elect to provide you with support or modifications for the Services (collectively, &ldquo;Support&rdquo;), in its sole discretion, and may terminate such Support at any time without notice to you. Cashflow may change, suspend, or discontinue any aspect of the Services at any time, including the availability of any Service. Cashflow may also impose limits on certain features and services or restrict your access to parts or all of the Services or the Cashflow website without notice or liability.
            </p>

            {/* Section VI */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">VI. Non-Disparagement</h2>
            <p>
              You agree that you will not make any critical, negative or disparaging remarks about Cashflow, its shareholders, partners, attorneys, members, directors, officers, agents, employees or representatives, affiliated, successors, or predecessor companies, the goods or services it provides, its business or employment practices, its executive leadership, strategies and/or business prospects. Cashflow, in its sole and absolute discretion, may discontinue your access to any Service or all Services.
            </p>

            {/* Section VII */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">VII. Disclaimer of Any Warranty</h2>
            <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 font-semibold text-white/70">
              <p>
                CASHFLOW DOES NOT REPRESENT OR WARRANT THAT THE SERVICES ARE FREE OF INACCURACIES, ERRORS, BUGS, OR INTERRUPTIONS, OR ARE RELIABLE, ACCURATE, COMPLETE, OR OTHERWISE VALID.
              </p>
              <p>
                THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; WITH NO WARRANTY, EXPRESS OR IMPLIED, OF ANY KIND AND CASHFLOW EXPRESSLY DISCLAIMS ANY AND ALL WARRANTIES AND CONDITIONS, INCLUDING, BUT NOT LIMITED TO, ANY IMPLIED WARRANTY OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AVAILABILITY, SECURITY, TITLE AND/OR NON-INFRINGEMENT.
              </p>
              <p>
                YOUR USE OF THE SERVICES IS AT YOUR OWN DISCRETION AND RISK, AND YOU WILL BE SOLELY RESPONSIBLE FOR ANY DAMAGE THAT RESULTS FROM THE USE OF THE SERVICES INCLUDING, BUT NOT LIMITED TO, ANY DAMAGE TO YOUR COMPUTER SYSTEM OR LOSS OF DATA.
              </p>
            </div>

            {/* Section VIII */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">VIII. Limitation of Liability</h2>
            <div className="space-y-4 pl-4">
              <p><strong className="text-white/70">A.</strong> CASHFLOW SHALL NOT, UNDER ANY CIRCUMSTANCES, BE LIABLE TO YOU FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL OR EXEMPLARY DAMAGES ARISING OUT OF OR IN CONNECTION WITH USE OF THE SERVICES, WHETHER BASED ON BREACH OF CONTRACT, BREACH OF WARRANTY, TORT (INCLUDING NEGLIGENCE, PRODUCT LIABILITY OR OTHERWISE), OR ANY OTHER PECUNIARY LOSS, WHETHER OR NOT CASHFLOW HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. UNDER NO CIRCUMSTANCES SHALL CASHFLOW BE LIABLE TO YOU FOR ANY AMOUNT. THE MAXIMUM DAMAGES TO WHICH YOU MAY BE ENTITLED FOR ANY REASON IS THE SUM PAID TO CASHFLOW IN THE PRIOR TWELVE (12) MONTHS ENDING ON THE DATE YOU FIRST NOTIFIED CASHFLOW OF YOUR CLAIM IN WRITING.</p>

              <p><strong className="text-white/70">B.</strong> CASHFLOW IS NOT A FINANCIAL, INVESTMENT, ACCOUNTING, OR LEGAL SERVICE. THE TOOLS AND CALCULATIONS PROVIDED ARE <strong className="text-white/80">FOR INFORMATIONAL PURPOSES ONLY</strong>. ANY RESULTS, PROJECTIONS, OR ANALYSES GENERATED BY CASHFLOW ARE ESTIMATES ONLY BASED ON DATA PROVIDED BY THE USER, EXTERNAL DATABASES, AND/OR PREDICTIONS FROM CASHFLOW&rsquo;S ALGORITHMS AND MAY NOT REFLECT ACTUAL OUTCOMES. CASHFLOW SHOULD NOT BE RELIED UPON AS A SUBSTITUTE FOR PROFESSIONAL ADVICE. YOU AGREE THAT YOU ARE SOLELY RESPONSIBLE FOR ANY INVESTMENT DECISIONS YOU MAKE BASED ON THE INFORMATION PROVIDED BY CASHFLOW, AND CASHFLOW IS NOT LIABLE FOR ANY FINANCIAL LOSS, INVESTMENT DECISIONS, OR BUSINESS OUTCOMES THAT RESULT FROM USE OF THE SERVICES OR RELIANCE ON THE INFORMATION PROVIDED.</p>
            </div>

            {/* Section IX */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">IX. Exclusions and Limitations</h2>
            <p>
              SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN WARRANTIES OR THE LIMITATION OR EXCLUSION OF LIABILITY FOR INCIDENTAL OR CONSEQUENTIAL DAMAGES. ACCORDINGLY, SOME OF THE ABOVE LIMITATIONS OF SECTIONS VI AND VII MAY NOT APPLY TO YOU.
            </p>

            {/* Section X */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">X. Release and Waiver</h2>
            <p>
              To the maximum extent permitted by applicable law, you hereby release and waive all claims against Cashflow, and its parent companies, subsidiaries, affiliates, officers, members, directors, agents, licensors, co-branders or other partners, and employees from any and all liability for claims, damages (actual and/or consequential), costs and expenses (including litigation costs and attorneys&rsquo; fees) of every kind and nature, arising from or in any way related to your use of the Services. If you are a California resident, you waive your rights under California Civil Code &sect; 1542, which states, &ldquo;A general release does not extend to claims which the creditor does not know or suspect to exist in his favor at the time of executing the release, which if known by him must have materially affected his settlement with the debtor.&rdquo; You understand that any fact relating to any matter covered by this release may be found to be other than now believed to be true and you accept and assume the risk of such possible differences in fact. In addition, you expressly waive and relinquish any and all rights and benefits which you may have under any other state or federal statute or common law principle of similar effect, to the fullest extent permitted by law.
            </p>

            {/* Section XI */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">XI. Hold Harmless and Indemnity</h2>
            <p>
              To the maximum extent permitted by applicable law, you agree to hold harmless and indemnify Cashflow and its parent companies, subsidiaries, affiliates, officers, members, directors, agents, licensors, co-branders or other partners, and employees from and against any third party claim arising from or in any way related to your use of the Services, including any liability or expense arising from all claims, losses, damages (actual and/or consequential), suits, judgments, litigation costs and attorneys&rsquo; fees, of every kind and nature. Cashflow shall use good faith efforts to provide you with written notice of such claim, suit or action.
            </p>

            {/* Section XII */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">XII. Cashflow&rsquo;s Reservation of Rights</h2>
            <p>
              Cashflow expressly reserves the right to immediately modify, suspend or terminate your access and use of the Services, if Cashflow, in its sole discretion: (a) believes you have violated or tried to violate the rights of others; (b) becomes aware of information indicating a safety concern for you, other Cashflow customers or clients, or the general public, or (c) believes that you have acted inconsistently with the spirit or letter of these Terms of Use. The Services, and its related benefits are offered at the discretion of Cashflow, and Cashflow has the right to modify or discontinue, temporarily or permanently, the Services, in whole or in part for any reason, with or without notice to you. You agree that Cashflow will not be liable to you or to any third party for any modifications or discontinuance of the Services.
            </p>

            {/* Section XIII */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">XIII. Binding Arbitration and Class Action Waiver</h2>

            <div className="rounded-2xl border border-[#CE7534]/20 bg-[#CE7534]/5 p-5">
              <p className="font-semibold text-white/70">
                PLEASE READ THIS SECTION CAREFULLY &ndash; IT MAY SIGNIFICANTLY AFFECT YOUR LEGAL RIGHTS, INCLUDING YOUR RIGHT TO FILE A LAWSUIT IN COURT. BY ACCESSING AND USING THE SERVICES, EACH REGISTRANT AGREES THAT TO THE EXTENT PERMITTED BY APPLICABLE LAW: ANY AND ALL DISPUTES, CLAIMS AND CAUSES OF ACTION ARISING OUT OF OR CONNECTED WITH CASHFLOW, WILL BE RESOLVED INDIVIDUALLY THROUGH BINDING ARBITRATION AS SET FORTH BELOW, WITHOUT RESORT TO ANY FORM OF LITIGATION OR CLASS ACTION.
              </p>
            </div>

            <div className="space-y-4 pl-4">
              <p><strong className="text-white/70">A. Initial Dispute Resolution.</strong> Cashflow&rsquo;s team is available to address any concerns you may have regarding the Services. Cashflow&rsquo;s team is able to resolve most concerns quickly. The parties shall use their best efforts through this customer care process to settle any dispute, claim, question, or disagreement and good faith negotiations, which shall be a condition to either party initiating a lawsuit or arbitration.</p>

              <p><strong className="text-white/70">B. Binding Arbitration.</strong> If the parties do not reach an agreed upon solution within a period of thirty (30) days from the time of informal dispute resolution under the Initial Dispute Resolution provision in Section XV(A), then either party may initiate binding arbitration as the sole means to resolve claims, subject to the terms set forth below. Specifically, all claims arising out of or relating to these Terms of Use (including their formation, performance and breach), the parties&rsquo; relationship with each other and/or your use of the Services shall be finally settled by binding arbitration administered by the American Arbitration Association (&ldquo;AAA&rdquo;) in accordance with the provisions of its rules and the supplementary procedures for consumer related disputes, excluding any rules or procedures governing or permitting class actions.</p>

              <p>The arbitrator, and not any federal, state or local court or agency, shall have exclusive authority to resolve all disputes arising out of or relating to the interpretation, applicability, enforceability or formation of these Terms of Use, including, but not limited to any claim that all or any part of these Terms of Use are void or voidable, or whether a claim is subject to arbitration. The arbitrator shall be empowered to grant whatever relief would be available in a court under law or in equity. The arbitrator&rsquo;s award shall be written, and binding on the parties and may be entered as a judgment in any court of competent jurisdiction.</p>

              <p>The rules governing the arbitration may be accessed at www.adr.org. The arbitration rules also permit a party to recover attorney&rsquo;s fees in certain cases. The parties understand that, absent this mandatory provision, they would have the right to sue in court and have a jury trial. They further understand that, in some instances, the costs of arbitration could exceed the costs of litigation and the right to discovery may be more limited in arbitration than in court.</p>

              <p><strong className="text-white/70">C. Location.</strong> Arbitration will take place in Cuyahoga County, Ohio.</p>

              <p><strong className="text-white/70">D. Class Action Waiver.</strong> The parties further agree that any arbitration shall be conducted in their individual capacities only and not as a class action or other representative action, and the parties expressly waive their right to file a class action or seek relief on a class basis. YOU AND CASHFLOW AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS OR REPRESENTATIVE PROCEEDING. If any court or arbitrator determines that the class action waiver set forth in this paragraph is void or unenforceable for any reason or that an arbitration can proceed on a class basis, then the arbitration provision set forth above shall be deemed null and void in its entirety and the parties shall be deemed to have not agreed to arbitrate disputes.</p>

              <p><strong className="text-white/70">E. Exception &ndash; Litigation of Intellectual Property and Small Claims Court Claims.</strong> Notwithstanding the parties&rsquo; decision to resolve all disputes through arbitration, either party may bring an action in state or federal court to protect its Intellectual Property Rights (&ldquo;Intellectual Property Rights&rdquo; means patents, copyrights, moral rights, trademarks, and trade secrets, but not privacy or publicity rights). Either party may also seek relief in a small claims court located in Medina County, Ohio for disputes or claims within the scope of that court&rsquo;s jurisdiction.</p>

              <p><strong className="text-white/70">F. 30-Day Right to Opt Out.</strong> You have the right to opt-out and not be bound by the arbitration and class action waiver provisions set forth above by sending written notice of your decision to opt-out to the following address: Cashflow Software LTD. 14837 Detroit Ave, #189, Lakewood, OH 44107. The notice must be sent within thirty (30) days of your first use of the Services otherwise you shall be bound to arbitrate disputes in accordance with the terms of those paragraphs. If you opt-out of these arbitration provisions, Cashflow also will not be bound by them and Cashflow reserves the right to decline service and refund payments made as of the date of receipt of your notice.</p>

              <p><strong className="text-white/70">G. Jurisdiction, Venue and Service.</strong> For any dispute not subject to arbitration, you and Cashflow agree to submit to the personal and exclusive jurisdiction of and venue in the state courts located in Cuyahoga County, Ohio. You further agree to accept service of process by regular U.S. mail, and hereby waive any and all jurisdictional and venue defenses otherwise available.</p>
            </div>

            <p>
              These Terms of Use, the relationship between you and Cashflow, and any issues and questions regarding the rights and obligations of a customer or client in connection with Cashflow shall be governed by, and construed in accordance with, the laws of the State of Ohio, U.S.A., without giving effect to conflict of laws provisions.
            </p>

            {/* Section XIV */}
            <h2 className="pt-4 text-lg font-semibold text-white/90">XIV. General Terms</h2>
            <div className="space-y-4 pl-4">
              <p><strong className="text-white/70">A. Relationship of the Parties.</strong> Notwithstanding any provision hereof, for all purposes of the Terms of Use, you and Cashflow shall be and act independently and not as partner, joint venturer, independent contractor, agent, employee or employer of the other. You shall not have any authority to assume or create any obligation for or on behalf of Cashflow, express or implied, and you shall not attempt to bind Cashflow to any contract.</p>

              <p><strong className="text-white/70">B. Invalidity of Specific Terms.</strong> If any provision of the Terms of Use is found by a court of competent jurisdiction to be invalid, the parties nevertheless agree that the court should endeavor to give effect to the parties&rsquo; intentions as reflected in the provision and the other provisions of such documents remain in full force and effect.</p>

              <p><strong className="text-white/70">C. Amendment.</strong> Cashflow reserves the right, in its sole and absolute discretion, to change, modify, add or delete portions of these terms of use at any time without notice, and it is your responsibility to review these terms of use for any changes. Your use of the Services following any amendment of these terms of use will signify and constitute your assent to and acceptance of such revised terms of use.</p>

              <p><strong className="text-white/70">D. Location of Lawsuit and Choice of Law.</strong> The Terms of Use and the relationship between you and Cashflow shall be governed by the laws of the State of Ohio without regard to its conflict of law provisions. You and Cashflow agree to submit to the personal jurisdiction of the courts located within Cuyahoga County, Ohio.</p>

              <p><strong className="text-white/70">E. No Waiver of Rights by Cashflow.</strong> Cashflow&rsquo;s failure to exercise or enforce any right or provision of the Terms of Use shall not constitute a waiver of such right or provision.</p>

              <p><strong className="text-white/70">F. Miscellaneous.</strong> The section headings and subheadings contained in this agreement are included for convenience only, and shall not limit or otherwise affect the terms of the Terms of Use. Any construction or interpretation to be made of the Terms of Use shall not be construed against the drafter. The Terms of Use constitute the entire agreement between Cashflow and you with respect to the subject matter hereof.</p>

              <p><strong className="text-white/70">G. Severability.</strong> The invalidity or unenforceability of any particular provision of these terms of use shall not affect the other provisions hereof, and this agreement shall be construed in all respects as if such invalid or unenforceable provision were omitted. The waiver by Cashflow of a breach of any provision of this agreement by you shall not operate or be construed as a waiver of any subsequent breach by you.</p>

              <p><strong className="text-white/70">H. Construction.</strong> All provisions of these terms of use shall be construed to the fullest extent permitted by law.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
