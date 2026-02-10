import Image from "next/image";
import RentalIcon from "@/components/icons/RentalIcon";
import BRRRRIcon from "@/components/icons/BRRRRIcon";
import FlipIcon from "@/components/icons/FlipIcon";

const navLinks = [
  { label: "Features", href: "#cashflow-ai" },
  { label: "Download", href: "#download" },
  { label: "Contact", href: "/contact" },
];

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      {/* ── Navigation ── */}
      <nav className="fixed top-0 z-50 w-full">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-8">
          <Image
            src="/images/logo-white.svg"
            alt="Cashflow"
            width={140}
            height={35}
            priority
          />
          <div className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1.5 backdrop-blur-xl md:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded-full px-4 py-1.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
          <a
            href="#download"
            className="rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Get the App
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen overflow-hidden">
        {/* Ambient gradient orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-glow-drift absolute -top-32 right-1/4 h-[600px] w-[600px] rounded-full bg-[#109C50]/20 blur-[128px]" />
          <div className="animate-glow-drift-slow absolute -bottom-48 left-1/4 h-[500px] w-[500px] rounded-full bg-[#8FB205]/15 blur-[128px]" />
          <div className="animate-glow-drift-slow absolute right-0 top-1/3 h-[400px] w-[400px] rounded-full bg-[#0891B2]/10 blur-[128px]" />
        </div>

        {/* Grid overlay */}
        <div className="grid-overlay pointer-events-none absolute inset-0" />

        {/* Decorative thin lines */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-0 h-full w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
          <div className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
          <div className="absolute left-3/4 top-0 h-full w-px bg-gradient-to-b from-transparent via-white/[0.06] to-transparent" />
        </div>

        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-6 pt-28 text-center lg:px-8">
          {/* Pill badge */}
          <a href="#cashflow-ai" className="animate-fade-in-up mb-8 inline-flex items-center gap-2 rounded-full border border-[#0891B2]/30 bg-[#0891B2]/10 px-4 py-1.5 text-sm text-[#CFFAFE] transition hover:bg-[#0891B2]/20">
            <svg
              className="h-4 w-4 animate-pulse-soft"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            Powered by CashflowAI
            <span className="ml-1">&rarr;</span>
          </a>

          <h1 className="animate-fade-in-up-delay-1 max-w-4xl text-5xl font-bold leading-[1.1] tracking-tight md:text-7xl">
            Instant Insights for
            <br />
            <span className="bg-gradient-to-r from-[#8FB205] via-[#109C50] to-[#0891B2] bg-clip-text text-transparent">
              Every Deal
            </span>
          </h1>

          <p className="animate-fade-in-up-delay-2 mt-6 max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
            AI-powered real estate calculators that analyze rental properties,
            BRRRR strategies, and fix &amp; flips — so you can invest with
            confidence.
          </p>

          <div className="animate-fade-in-up-delay-3 mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#download"
              className="inline-flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 font-semibold text-[#0E2C28] transition hover:shadow-lg hover:shadow-white/10"
            >
              Download the App
            </a>
            <a
              href="#cashflow-ai"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 font-semibold text-white transition hover:bg-white/10"
            >
              Discover More
            </a>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-10 left-6 flex items-center gap-3 text-sm text-white/40">
            <div className="flex h-8 w-5 items-start justify-center rounded-full border border-white/20 pt-1.5">
              <div className="h-1.5 w-1 animate-bounce rounded-full bg-white/60" />
            </div>
            Scroll down
          </div>
        </div>
      </section>

      {/* ── CashflowAI Feature Section ── */}
      <section id="cashflow-ai" className="relative py-32">
        {/* Background accent */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-[#0891B2]/30 to-transparent" />
          <div className="animate-glow-drift-slow absolute left-1/3 top-1/4 h-[400px] w-[400px] rounded-full bg-[#0891B2]/8 blur-[128px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          {/* Section header */}
          <div className="mb-20 max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium tracking-wider text-[#0891B2] uppercase">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              CashflowAI
            </div>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
              AI-Powered Property
              <br />
              <span className="text-[#0891B2]">Instant Insights</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-white/50">
              Get real-time, AI-generated analysis on any property. From
              neighborhood demographics to creative financing strategies —
              CashflowAI surfaces the intel you need in seconds.
            </p>
          </div>

          {/* AI Insight Cards — three calculators */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Rental */}
            <div className="glass-card group rounded-3xl p-7 transition hover:border-[#109C50]/30">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#109C50]/15">
                  <RentalIcon className="h-5 w-5 text-[#109C50]" />
                </div>
                <div>
                  <h3 className="font-semibold">Rental</h3>
                  <p className="text-xs text-white/40">Know if a property will pay you every month</p>
                </div>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-white/50">
                Enter any address and instantly see how much monthly income a
                rental property could generate after all expenses. Perfect if
                you want to build long-term wealth through rental income.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
                  <p className="text-[11px] text-white/30 uppercase tracking-wider">Annual Cashflow</p>
                  <p className="text-sm font-semibold text-[#109C50]">+$7,500/yr</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
                  <p className="text-[11px] text-white/30 uppercase tracking-wider">Cash on Cash</p>
                  <p className="text-sm font-semibold text-white/70">+14.67%</p>
                </div>
              </div>
            </div>

            {/* BRRRR */}
            <div className="glass-card group rounded-3xl p-7 transition hover:border-[#087A93]/30">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#087A93]/15">
                  <BRRRRIcon className="h-5 w-5 text-[#087A93]" />
                </div>
                <div>
                  <h3 className="font-semibold">BRRRR</h3>
                  <p className="text-xs text-white/40">Recycle your cash across multiple properties</p>
                </div>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-white/50">
                See how much equity you can capture by buying below market,
                rehabbing, and refinancing. Perfect if you want to scale a
                portfolio without tying up all your capital.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
                  <p className="text-[11px] text-white/30 uppercase tracking-wider">Equity Captured</p>
                  <p className="text-sm font-semibold text-[#087A93]">$48,200</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
                  <p className="text-[11px] text-white/30 uppercase tracking-wider">Return on Equity</p>
                  <p className="text-sm font-semibold text-white/70">+72.5%</p>
                </div>
              </div>
            </div>

            {/* Fix & Flip */}
            <div className="glass-card group rounded-3xl p-7 transition hover:border-[#CE7534]/30">
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#CE7534]/15">
                  <FlipIcon className="h-5 w-5 text-[#CE7534]" />
                </div>
                <div>
                  <h3 className="font-semibold">Fix &amp; Flip</h3>
                  <p className="text-xs text-white/40">Find out your profit before you buy</p>
                </div>
              </div>
              <p className="mb-5 text-sm leading-relaxed text-white/50">
                Get an instant breakdown of your net profit, total costs, and
                ROI for any potential flip. Perfect if you want to buy,
                renovate, and sell for a profit in months, not years.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
                  <p className="text-[11px] text-white/30 uppercase tracking-wider">Net Profit</p>
                  <p className="text-sm font-semibold text-[#CE7534]">$38,800</p>
                </div>
                <div className="rounded-xl bg-white/[0.04] px-3 py-2.5">
                  <p className="text-[11px] text-white/30 uppercase tracking-wider">Cash ROI</p>
                  <p className="text-sm font-semibold text-white/70">+51.2%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features / How It Works ── */}
      <section id="features" className="relative py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            {/* Left — text */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 text-sm font-medium tracking-wider text-[#0891B2] uppercase">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                How CashflowAI Works
              </div>
              <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
                From address to analysis
                <br />
                <span className="text-white/40">in three steps</span>
              </h2>

              <div className="mt-12 space-y-10">
                <div className="flex gap-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8FB205] to-[#109C50] text-sm font-bold text-white">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold">Enter an Address &amp; Select Strategy</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/50">
                      Type in any property address and choose your investment
                      approach — Rental, BRRRR, or Fix &amp; Flip.
                    </p>
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#109C50] to-[#087A93] text-sm font-bold text-white">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold">Enter Your Expenses</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/50">
                      Input your rehab and operating expenses manually, or
                      load from your presaved templates to move faster.
                    </p>
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#087A93] to-[#0891B2] text-sm font-bold text-white">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      Get AI-Powered Analysis
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/50">
                      Instant metrics plus CashflowAI insights — cashflow, ROI,
                      cap rate, comps, and neighborhood intelligence.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right — app screenshot */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute -inset-8 rounded-[40px] bg-gradient-to-br from-[#109C50]/20 via-[#0891B2]/10 to-transparent blur-3xl" />
                <div className="relative overflow-hidden rounded-[32px] border border-white/10 shadow-2xl shadow-black/40">
                  <Image
                    src="/images/IntroImage.png"
                    alt="Cashflow app — rental property analysis screen"
                    width={320}
                    height={640}
                    className="block"
                    priority
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Download CTA ── */}
      <section id="download" className="relative py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-px w-3/4 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          <div className="animate-glow-drift absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#109C50]/10 blur-[128px]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center lg:px-8">
          <Image
            src="/images/CashflowAppIcon.png"
            alt="Cashflow app icon"
            width={72}
            height={72}
            className="mx-auto mb-8 rounded-2xl"
          />
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Start Analyzing Deals
          </h2>
          <p className="mt-4 text-lg text-white/50">
            Join hundreds of real estate investors making smarter decisions
            with Cashflow.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://apps.apple.com/us/app/cashflow-underwriter/id6746049962"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-full bg-white px-8 py-4 text-lg font-semibold text-[#0E2C28] transition hover:shadow-lg hover:shadow-white/10"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              App Store
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.btanski.cashflow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-full border border-white/20 px-8 py-4 text-lg font-semibold text-white transition hover:bg-white/10"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35m13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27m3.35-4.31c.34.27.56.69.56 1.19s-.22.92-.56 1.19l-1.97 1.13-2.5-2.5 2.5-2.5 1.97 1.13M6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z" />
              </svg>
              Google Play
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/[0.06] py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="flex flex-col items-center gap-8 md:flex-row md:justify-between">
            <div className="flex flex-col items-center gap-3 md:items-start">
              <Image
                src="/images/logo-white.svg"
                alt="Cashflow"
                width={120}
                height={30}
              />
              <p className="text-sm text-white/30">
                Real estate investment calculators for smarter decisions.
              </p>
            </div>
            <div className="flex gap-8 text-sm text-white/40">
              <a
                href="/contact"
                className="transition hover:text-white"
              >
                Support
              </a>
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-white"
              >
                Privacy
              </a>
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-white"
              >
                Terms
              </a>
            </div>
          </div>
          <div className="mt-8 border-t border-white/[0.06] pt-8 text-center text-sm text-white/20">
            &copy; {new Date().getFullYear()} Cashflow. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
