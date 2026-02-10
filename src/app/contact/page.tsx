"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import emailjs from "@emailjs/browser";

const SERVICE_ID = "service_t7bnpuw";
const TEMPLATE_ID = "template_hw9xjum";
const PUBLIC_KEY = "soTZr82zUD6121ehU";

type Status = "idle" | "sending" | "success" | "error";

export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const canSubmit =
    email.trim() !== "" &&
    subject.trim() !== "" &&
    message.trim() !== "" &&
    status !== "sending";

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setStatus("sending");
    setErrorMessage("");

    try {
      await emailjs.send(
        SERVICE_ID,
        TEMPLATE_ID,
        {
          email,
          title: subject,
          feedback: message,
        },
        { publicKey: PUBLIC_KEY }
      );

      setEmail("");
      setSubject("");
      setMessage("");
      setStatus("success");
    } catch (err) {
      console.error("EmailJS error:", err);
      setErrorMessage("Failed to send message. Please try again later.");
      setStatus("error");
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Ambient gradient orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-glow-drift absolute -top-32 right-1/4 h-[600px] w-[600px] rounded-full bg-[#109C50]/20 blur-[128px]" />
        <div className="animate-glow-drift-slow absolute -bottom-48 left-1/4 h-[500px] w-[500px] rounded-full bg-[#8FB205]/15 blur-[128px]" />
      </div>

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

      {/* Contact Form */}
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 pt-28 pb-16">
        <div className="glass-card w-full rounded-3xl p-8 md:p-10">
          <h1 className="mb-2 text-3xl font-bold tracking-tight md:text-4xl">
            Get in Touch
          </h1>
          <p className="mb-8 text-white/50">
            Have a question or feedback? We&apos;d love to hear from you.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-white/60"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (status === "success" || status === "error")
                    setStatus("idle");
                }}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-[#109C50]/50 focus:ring-1 focus:ring-[#109C50]/50"
              />
            </div>

            {/* Subject */}
            <div>
              <label
                htmlFor="subject"
                className="mb-2 block text-sm font-medium text-white/60"
              >
                Subject
              </label>
              <input
                id="subject"
                type="text"
                required
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (status === "success" || status === "error")
                    setStatus("idle");
                }}
                placeholder="What's this about?"
                className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-[#109C50]/50 focus:ring-1 focus:ring-[#109C50]/50"
              />
            </div>

            {/* Message */}
            <div>
              <label
                htmlFor="message"
                className="mb-2 block text-sm font-medium text-white/60"
              >
                Message
              </label>
              <textarea
                id="message"
                required
                rows={5}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (status === "success" || status === "error")
                    setStatus("idle");
                }}
                placeholder="Tell us more..."
                className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-[#109C50]/50 focus:ring-1 focus:ring-[#109C50]/50"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-full bg-[#109C50] py-3.5 font-semibold text-white transition hover:bg-[#0e8a46] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "sending" ? "Sending..." : "Send Message"}
            </button>

            {/* Status Messages */}
            {status === "success" && (
              <p className="text-center text-sm text-[#109C50]">
                Message sent successfully! We&apos;ll get back to you soon.
              </p>
            )}
            {status === "error" && (
              <p className="text-center text-sm text-red-400">
                {errorMessage}
              </p>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
