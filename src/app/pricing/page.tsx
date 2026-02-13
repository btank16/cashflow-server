"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

const TIERS = [
  {
    name: "Free",
    color: "#109C50",
    monthly: "$0",
    annual: "$0",
    monthlySubtext: "No credit card required",
    annualSubtext: "No credit card required",
    features: [
      { text: "3 uses per month", included: true },
      { text: "Custom expense & rehab templates", included: false },
      { text: "AI-powered property insights", included: false },
      { text: "AI offer letter generation", included: false },
      { text: "Branded PDF exports", included: false },
    ],
  },
  {
    name: "Investor",
    color: "#087A93",
    monthly: "$19.99/mo",
    annual: "$199.99/yr",
    monthlySubtext: "Billed monthly",
    annualSubtext: "Only $16.67/mo",
    features: [
      { text: "50 AI searches per month", included: true },
      { text: "Custom expense & rehab templates", included: true },
      { text: "AI-powered property insights", included: true },
      { text: "AI offer letter generation", included: false },
      { text: "Branded PDF exports", included: false },
    ],
  },
  {
    name: "Mogul",
    color: "#CE7534",
    monthly: "$39.99/mo",
    annual: "$399.99/yr",
    monthlySubtext: "Billed monthly",
    annualSubtext: "Only $33.33/mo",
    freeTrial: true,
    features: [
      { text: "200 AI searches per month", included: true },
      { text: "Custom expense & rehab templates", included: true },
      { text: "AI-powered property insights", included: true },
      { text: "AI offer letter generation", included: true },
      { text: "Branded PDF exports", included: true },
    ],
  },
];

export default function PricingPage() {
  const [period, setPeriod] = useState<"monthly" | "annual">("annual");

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Subtle gradient wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#109C50]/10 via-transparent to-[#0891B2]/5" />

      {/* Grid overlay */}
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

      {/* Pricing Content */}
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 pt-28 pb-16 lg:px-8">
        {/* Header */}
        <div className="animate-fade-in-up mb-4 text-center">
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
            Pricing
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            Unlock{" "}
            <span className="bg-gradient-to-r from-[#8FB205] via-[#109C50] to-[#0891B2] bg-clip-text text-transparent">
              Pro Features
            </span>
          </h1>
          <p className="mt-3 text-base text-white/50 sm:text-lg">
            Get your first week free.
          </p>
        </div>

        {/* Period Toggle */}
        <div className="animate-fade-in-up-delay-1 mb-8 flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl sm:mb-10">
          <button
            onClick={() => setPeriod("monthly")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              period === "monthly"
                ? "bg-white/15 text-white"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setPeriod("annual")}
            className={`rounded-full px-5 py-2 text-sm font-medium transition ${
              period === "annual"
                ? "bg-white/15 text-white"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            Annual
            <span className="ml-1.5 rounded-full bg-[#109C50]/20 px-2 py-0.5 text-xs text-[#109C50]">
              Save 17%
            </span>
          </button>
        </div>

        {/* Tier Cards */}
        <div className="animate-fade-in-up-delay-2 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className="glass-card relative flex flex-col rounded-3xl p-6 transition hover:border-white/15 sm:p-7"
              style={{
                borderColor: tier.freeTrial
                  ? `${tier.color}40`
                  : undefined,
              }}
            >
              {/* Free trial badge */}
              {tier.freeTrial && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold tracking-wider text-white uppercase"
                  style={{ backgroundColor: tier.color }}
                >
                  Free Trial
                </div>
              )}

              {/* Tier header */}
              <div className="mb-5">
                <div className="mb-3 flex items-center gap-2.5">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: tier.color }}
                  />
                  <h2 className="text-lg font-bold">{tier.name}</h2>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold sm:text-4xl">
                    {period === "annual" ? tier.annual : tier.monthly}
                  </span>
                </div>
                <p className="mt-1 text-sm text-white/40">
                  {period === "annual"
                    ? tier.annualSubtext
                    : tier.monthlySubtext}
                </p>
              </div>

              {/* Divider */}
              <div className="mb-5 h-px bg-white/[0.08]" />

              {/* Features */}
              <ul className="mb-6 flex-1 space-y-3">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    {feature.included ? (
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#109C50"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    )}
                    <span
                      className={`text-sm ${
                        feature.included ? "text-white" : "text-white/40"
                      }`}
                    >
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href="/#download"
                className="block w-full rounded-full py-3 text-center text-sm font-semibold text-white transition"
                style={{
                  backgroundColor: tier.freeTrial
                    ? tier.color
                    : "transparent",
                  border: tier.freeTrial
                    ? "none"
                    : "1px solid rgba(255,255,255,0.15)",
                }}
                onMouseOver={(e) => {
                  if (!tier.freeTrial) {
                    e.currentTarget.style.backgroundColor =
                      "rgba(255,255,255,0.08)";
                  }
                }}
                onMouseOut={(e) => {
                  if (!tier.freeTrial) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                Get the App
              </a>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="animate-fade-in-up-delay-3 mt-8 text-center text-sm text-white/30">
          Subscribe through the Cashflow app on iOS or Android.
        </p>
      </div>
    </main>
  );
}
