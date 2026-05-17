import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Car, Calendar, DollarSign, Send } from 'lucide-react';
import { BrushBlob, BrushCircle, BrushLeaf } from './brush/BrushMotifs';

// ──────────────────────────────────────────────────────────────────────
// Avayble's public landing page. Lives at "/" for unauthenticated
// visitors; authenticated users are routed past it to their dashboard
// (App.js). Single page, atelier-styled, opinionated. Modeled on the
// product's own restraint — calm voice, considered spacing, no
// laundry-list of features.
//
// Sections, top to bottom:
//   1. Hero — single opinionated headline + CTA
//   2. Product screenshot — let the design do the talking
//   3. Four wedge scenes — specific moments, not features
//   4. Founder bio — the unfair advantage (real practicing therapist)
//   5. Pricing + final CTA — honest, upfront
//   6. Footer — minimal
//
// Screenshots are intentionally placeholder boxes; swap in real
// scrubbed captures once Ivan provides them.
// ──────────────────────────────────────────────────────────────────────

// Negative margins cancel App.js's <main> padding (px-4 sm:px-6 lg:px-8
// py-6) so the landing can use full-bleed background bands. Section
// inner content re-applies its own max-width constraint.
const fullBleed = '-mx-4 sm:-mx-6 lg:-mx-8 -my-6';

const Landing = () => {
  return (
    <div className={`${fullBleed} av-paper pt-16`}>
      <Hero />
      <ProductHeroScreenshot />
      <Scenes />
      <FounderBio />
      <PricingCta />
      <Footer />
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────
// Hero
// ──────────────────────────────────────────────────────────────────────
const Hero = () => (
  <section className="relative overflow-hidden">
    {/* Brush blob in the corner — atelier signature, decorative only */}
    <div className="absolute -top-20 -right-20 pointer-events-none" style={{ zIndex: 0 }}>
      <BrushBlob width={520} height={520} color="#B07A4E" opacity={0.07} />
    </div>

    <div className="relative z-10 max-w-5xl mx-auto px-6 sm:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
      <div className="av-eyebrow text-accent mb-5">Avayble</div>

      <h1
        className="font-display"
        style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.25rem)',
          lineHeight: 1.05,
          fontWeight: 500,
          letterSpacing: '-0.015em',
          maxWidth: '20ch',
        }}
      >
        A booking tool for massage therapists.{' '}
        <em style={{ color: '#B07A4E', fontStyle: 'italic' }}>Built by one.</em>
      </h1>

      <p
        className="mt-6 text-ink-2"
        style={{
          fontSize: 'clamp(1.0625rem, 1.4vw, 1.25rem)',
          lineHeight: 1.55,
          maxWidth: '52ch',
        }}
      >
        Mobile-first. No bloat. No reception desk required.
        Run your whole practice from your phone, between sessions.
      </p>

      <div className="mt-9 flex flex-col sm:flex-row sm:items-center gap-4">
        <Link
          to="/signup"
          className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-btn
            bg-accent text-white text-[15px] font-medium hover:bg-accent-ink transition shadow-sm"
        >
          Try Avayble <ArrowRight className="w-4 h-4" />
        </Link>
        <span className="text-sm text-ink-3">
          14 days free. No card required to start.
        </span>
      </div>
    </div>
  </section>
);

// ──────────────────────────────────────────────────────────────────────
// Product hero screenshot — phone frame containing the dashboard.
// Placeholder for now; replace src with a real scrubbed capture
// (recommended: ProviderDashboard on mobile width, ~390px wide).
// ──────────────────────────────────────────────────────────────────────
const ProductHeroScreenshot = () => (
  <section className="relative bg-paper-elev border-y border-line">
    <div className="max-w-5xl mx-auto px-6 sm:px-8 py-16 sm:py-20">
      <div className="flex justify-center">
        <PhoneFrame>
          <ScreenshotPlaceholder
            label="Provider Dashboard"
            note="phone width · ~390×844 · scrub client names + dollar amounts"
            aspect="9/19.5"
          />
        </PhoneFrame>
      </div>
    </div>
  </section>
);

// ──────────────────────────────────────────────────────────────────────
// Four wedge scenes — alternating two-column layout (image / copy),
// each one a specific moment the target audience recognizes.
// ──────────────────────────────────────────────────────────────────────
const Scenes = () => {
  const scenes = [
    {
      icon: Car,
      eyebrow: 'On the road',
      title: 'Travel time, auto-blocked between bookings.',
      body:
        'Avayble knows the drive between one client and the next. Won\'t let you book a 10am in Encino and an 11am in Westwood. The buffer adjusts automatically based on the addresses.',
      screenshotLabel: 'Calendar with blocked travel buffers',
      screenshotNote: 'desktop or wide phone · show two mobile bookings with a greyed travel block between them',
    },
    {
      icon: Calendar,
      eyebrow: 'The shape of your week',
      title: 'Mobile days, studio days, both — at a glance.',
      body:
        'Color-coded calendar shading shows where you\'re going and where they\'re coming. Plan your week the way it actually flows — green for on-the-road, blue for in-studio, split for either-or days.',
      screenshotLabel: 'Month calendar with green/blue/split tile shading',
      screenshotNote: 'desktop view · ProviderAvailability month view · highlight a week with mixed kinds',
    },
    {
      icon: DollarSign,
      eyebrow: 'Tax season stops being a guess',
      title: 'Income mapped to how you actually file.',
      body:
        'Cash, checks, payment apps, cards, package sales — separated the way your Schedule C asks for them. Cash-basis reporting that matches what the IRS expects from a sole prop. No spreadsheet, no shoebox, no surprises in April.',
      screenshotLabel: 'Income report with per-method breakdown',
      screenshotNote: 'desktop · ReportsPage Income tab · scrub or mock the totals',
    },
    {
      icon: Send,
      eyebrow: 'Fill the quiet weeks',
      title: 'A weekly text to your roster, in two taps.',
      body:
        'Got open slots Thursday and Friday? Avayble drafts the message — your opening line, the day-by-day openings auto-generated from your real availability, your closing line with the booking link. You review, tweak, send. Your roster gets one helpful text a week, not spam.',
      screenshotLabel: 'Weekly outreach composer with preview',
      screenshotNote: 'desktop or wide phone · ProviderWeeklyOutreach with a drafted message visible',
    },
  ];

  return (
    <section className="relative">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-20 sm:py-28">
        <div className="flex flex-col gap-20 sm:gap-28">
          {scenes.map((scene, idx) => (
            <Scene key={scene.title} {...scene} reverse={idx % 2 === 1} />
          ))}
        </div>
      </div>
    </section>
  );
};

const Scene = ({ icon: Icon, eyebrow, title, body, screenshotLabel, screenshotNote, reverse }) => (
  <div
    className={`grid grid-cols-1 lg:grid-cols-2 gap-10 sm:gap-14 items-center ${
      reverse ? 'lg:[direction:rtl]' : ''
    }`}
  >
    <div className={reverse ? 'lg:[direction:ltr]' : ''}>
      <div className="flex items-center gap-2.5 mb-4">
        <Icon className="w-5 h-5 text-accent" />
        <span className="av-eyebrow text-accent">{eyebrow}</span>
      </div>
      <h2
        className="font-display"
        style={{
          fontSize: 'clamp(1.75rem, 3vw, 2.25rem)',
          lineHeight: 1.15,
          fontWeight: 500,
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h2>
      <p
        className="mt-5 text-ink-2"
        style={{ fontSize: '1.0625rem', lineHeight: 1.6, maxWidth: '44ch' }}
      >
        {body}
      </p>
    </div>
    <div className={reverse ? 'lg:[direction:ltr]' : ''}>
      <ScreenshotPlaceholder label={screenshotLabel} note={screenshotNote} aspect="16/10" />
    </div>
  </div>
);

// ──────────────────────────────────────────────────────────────────────
// Founder bio — the unfair advantage in plain text.
// ──────────────────────────────────────────────────────────────────────
const FounderBio = () => (
  <section className="relative bg-paper-elev border-y border-line overflow-hidden">
    <div className="absolute -bottom-12 -left-12 pointer-events-none" style={{ opacity: 0.08 }}>
      <BrushLeaf size={280} color="#B07A4E" />
    </div>

    <div className="relative z-10 max-w-4xl mx-auto px-6 sm:px-8 py-20 sm:py-24">
      <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-8 sm:gap-12 items-start">
        <FounderPhotoPlaceholder />
        <div>
          <div className="av-eyebrow text-accent mb-4">Why I built this</div>
          <div
            className="font-display"
            style={{ fontSize: '1.375rem', lineHeight: 1.45, fontWeight: 500 }}
          >
            <p>
              I&rsquo;m Ivan. I&rsquo;ve been a massage therapist in Orange County for
              12 years.
            </p>
            <p className="mt-4">
              I built Avayble because every other tool felt like it was designed by
              people who&rsquo;d never touched a client. Mindbody is bloated software
              for spas. Square Appointments is generic and ugly. Jane is for clinics.
              Nothing was built for someone like me &mdash; running a one-person
              practice from a phone, mostly mobile, who cares how their tools feel.
            </p>
            <p className="mt-4" style={{ color: '#B07A4E', fontStyle: 'italic' }}>
              If that&rsquo;s you, this is for you.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ──────────────────────────────────────────────────────────────────────
// Pricing — single tier, upfront, no surprises.
// ──────────────────────────────────────────────────────────────────────
const PricingCta = () => (
  <section className="relative">
    <div className="absolute top-1/2 -translate-y-1/2 right-0 pointer-events-none" style={{ opacity: 0.06 }}>
      <BrushCircle size={420} color="#B07A4E" stroke={10} />
    </div>

    <div className="relative z-10 max-w-3xl mx-auto px-6 sm:px-8 py-24 sm:py-32 text-center">
      <div className="av-eyebrow text-accent mb-5">One price. No tiers.</div>

      <div className="flex items-baseline justify-center gap-2">
        <span
          className="font-display"
          style={{
            fontSize: 'clamp(4rem, 10vw, 6rem)',
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          $29
        </span>
        <span className="text-ink-2 text-lg">/month</span>
      </div>

      <p className="mt-5 text-ink-2" style={{ fontSize: '1.0625rem' }}>
        14 days free. No card required to start. Cancel anytime.
      </p>

      <div className="mt-9">
        <Link
          to="/signup"
          className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-btn
            bg-accent text-white text-[15px] font-medium hover:bg-accent-ink transition shadow-sm"
        >
          Start your trial <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <p className="mt-5 text-xs text-ink-3">
        Already have an account?{' '}
        <Link to="/login" className="text-accent hover:text-accent-ink underline">
          Sign in
        </Link>
      </p>
    </div>
  </section>
);

// ──────────────────────────────────────────────────────────────────────
// Footer — minimal, honest.
// ──────────────────────────────────────────────────────────────────────
const Footer = () => (
  <footer className="border-t border-line bg-paper-elev">
    <div className="max-w-5xl mx-auto px-6 sm:px-8 py-10 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
      <div className="text-sm text-ink-2">
        Built in Orange County by Ivan, RMT.
      </div>
      <div className="flex gap-5 text-sm text-ink-2">
        <a href="/privacy-policy.html" className="hover:text-accent transition">
          Privacy
        </a>
        <Link to="/login" className="hover:text-accent transition">
          Sign in
        </Link>
        <span className="text-ink-3">© 2026 Avayble LLC</span>
      </div>
    </div>
  </footer>
);

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

// A labeled empty box where a real screenshot belongs. Renders as a
// soft card with a centered label so it's obvious in the preview which
// shot needs capturing. Replace with <img src="..." alt={label} /> once
// real screenshots are in /public/landing/.
const ScreenshotPlaceholder = ({ label, note, aspect = '16/10' }) => (
  <div
    className="bg-paper-deep border border-line rounded-card shadow-atelier-sm w-full flex items-center justify-center text-center"
    style={{ aspectRatio: aspect }}
  >
    <div className="px-6 py-8">
      <div className="av-eyebrow text-ink-3 mb-2">screenshot</div>
      <div className="font-display text-ink" style={{ fontSize: '1rem', fontWeight: 500 }}>
        {label}
      </div>
      {note && <div className="text-xs text-ink-3 mt-2 italic">{note}</div>}
    </div>
  </div>
);

// Simple phone frame around any child. Approximate iPhone 14 dimensions
// at moderate scale. CSS only — no asset dependencies.
const PhoneFrame = ({ children }) => (
  <div
    className="relative bg-ink rounded-[2.5rem] shadow-atelier-lg p-2"
    style={{ width: 'min(360px, 90vw)' }}
  >
    <div className="rounded-[2rem] overflow-hidden bg-paper-elev">{children}</div>
  </div>
);

const FounderPhotoPlaceholder = () => (
  <div
    className="bg-paper-deep border border-line rounded-card shadow-atelier-sm flex flex-col items-center justify-center text-center"
    style={{ width: '100%', maxWidth: 200, aspectRatio: '1/1' }}
  >
    <div className="px-4">
      <div className="av-eyebrow text-ink-3 mb-2">photo</div>
      <div className="text-xs text-ink-3 italic">
        Ivan in the studio · or between clients · square ~600×600
      </div>
    </div>
  </div>
);

export default Landing;
