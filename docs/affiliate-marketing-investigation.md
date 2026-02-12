# Affiliate Marketing Investigation

## Table of Contents
1. [Current Architecture Summary](#current-architecture-summary)
2. [Cognito Groups & Payments Impact Analysis](#cognito-groups--payments-impact-analysis)
3. [Adding Authentication to the Web App](#adding-authentication-to-the-web-app)
4. [Affiliate Marketing Implementation Options](#affiliate-marketing-implementation-options)
5. [Recommended Architecture](#recommended-architecture)

---

## Current Architecture Summary

### Cognito User Pool
- **Auth methods:** Email/password, Google OAuth, Apple Sign-In
- **User groups:** `basic`, `beta`, `premium`, `platinum`, `admin`
- **Post-confirmation trigger:** New users auto-added to `basic` group
- **Custom attributes:** `origin_state`, `interest_state`, `terms`, `email_updates`, `invest_strategy`, `referral_code`

### Payments Workflow
- **Provider:** RevenueCat (iOS App Store + Google Play subscriptions)
- **Sync paths:** RevenueCat webhooks (primary) + client-side sync (secondary)
- **Entitlement resolution:** `getUserEntitlementsAsync()` checks `UserSubscription` DynamoDB table first, falls back to Cognito groups
- **Group management:** Webhooks add/remove users from `premium`/`platinum` groups; only these two are considered "paid tier groups" (`PAID_TIER_GROUPS` array in `revenueCatWebhook/handler.ts`)

### Web App (Next.js)
- **Current state:** Public marketing site only (home, pricing, contact, privacy, terms)
- **No authentication flows** on the web app today
- **Amplify is configured** in `providers.tsx` but only for SSR; no auth UI components exist

---

## Cognito Groups & Payments Impact Analysis

### The Core Question: Will an `affiliate` Group Break Payments?

**Short answer: No, it will not — if handled correctly.**

Here is the detailed analysis of every place groups are used and what would happen if a user is in both `affiliate` and another group simultaneously:

### 1. `getTierFromCognitoGroups()` — Tier Resolution (`tiers.ts:106-112`)

```typescript
export function getTierFromCognitoGroups(groups: string[]): TierName {
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('platinum')) return 'platinum';
  if (groups.includes('premium')) return 'premium';
  if (groups.includes('beta')) return 'beta';
  return 'basic';
}
```

**Impact:** `affiliate` is not in this priority chain, so it is **completely ignored** during tier resolution. A user in `['affiliate', 'premium']` would correctly resolve to `premium`. **No impact.**

### 2. `getUserEntitlementsAsync()` — Entitlement Resolution (`authorization.ts:173-204`)

This function checks the `UserSubscription` DynamoDB table first, and falls back to Cognito groups. The Cognito group fallback uses `getTierFromCognitoGroups()` which (per above) ignores `affiliate`.

**No impact.**

### 3. RevenueCat Webhook — Subscription Activation (`revenueCatWebhook/handler.ts:91-236`)

When a subscription activates, the webhook handler:
1. Gets current Cognito groups for the user
2. Removes user from other `PAID_TIER_GROUPS` (only `premium` and `platinum`)
3. Removes from `beta` if subscribing
4. Adds to the target tier group

```typescript
const PAID_TIER_GROUPS = [COGNITO_GROUPS.PREMIUM, COGNITO_GROUPS.PLATINUM];
```

**Impact:** The handler only touches `premium`, `platinum`, and `beta` groups. It does **not** enumerate all groups and remove them — it specifically targets paid tier groups. An `affiliate` group membership would be **untouched**. **No impact.**

### 4. RevenueCat Webhook — Subscription Expiration (`revenueCatWebhook/handler.ts:241-316`)

On expiration, the handler removes the user from all `PAID_TIER_GROUPS` only:

```typescript
for (const group of PAID_TIER_GROUPS) {
  if (currentGroups.includes(group)) {
    // remove from group
  }
}
```

**Impact:** Only `premium` and `platinum` are removed. `affiliate` is untouched. **No impact.**

### 5. `syncSubscription` — Client-Side Sync (`syncSubscription/handler.ts`)

Same pattern: only manages `PAID_TIER_GROUPS`. **No impact.**

### 6. Storage Authorization (`storage/resource.ts`)

S3 access is granted to specific groups: `basic`, `premium`, `platinum`, `beta`, `admin`. The `affiliate` group would not have S3 access by default, which is fine since affiliates don't need PDF storage access.

**No impact** (but you'd need to explicitly add `affiliate` if affiliates need storage access in the future).

### 7. AppSync Authorization Rules (`data/resource.ts`)

Current rules use:
- `allow.authenticated()` — works for any logged-in user regardless of group
- `allow.group('admin')` — only checks for admin group
- `allow.owner()` — only checks ownership

**No impact.** The `affiliate` group would need its own authorization rules for affiliate-specific queries/mutations.

### Summary: Safe to Add `affiliate` Group

The `affiliate` group is **safe to add** because:
- Tier resolution explicitly ignores unknown groups (priority chain only checks known tiers)
- The payments webhook only manages `PAID_TIER_GROUPS` (`premium`, `platinum`) and `beta`
- Users can be in both `affiliate` AND a subscription tier simultaneously with no conflicts
- A user could be `['basic', 'affiliate']`, `['premium', 'affiliate']`, or `['platinum', 'affiliate']` — all work correctly

### One Consideration: Post-Confirmation Trigger

The current post-confirmation trigger (`post-confirmation/handler.ts`) adds new users to `basic`. It does **not** add them to `affiliate`. You would need a **separate admin action or approval workflow** to add users to the `affiliate` group (not automatic on signup).

---

## Adding Authentication to the Web App

### Current State

The web app (`src/app/`) is a Next.js 16 application using the App Router. Amplify is already configured in `providers.tsx` with `{ ssr: true }`, but no auth UI or protected routes exist.

### What Needs to Happen

1. **Add Amplify UI Authenticator or build custom auth pages** — Amplify provides `@aws-amplify/ui-react` with a pre-built `<Authenticator>` component, or you can build custom login/signup forms using the `aws-amplify/auth` module directly.

2. **Add callback/logout URLs for the web domain** — The current `callbackUrls` in `amplify/auth/resource.ts` only include mobile deep links (`cashflow://`, `exp://...`). You need to add your web domain (e.g., `https://yourdomain.com/`, `http://localhost:3000/` for dev) to support Google/Apple OAuth on web.

3. **Create protected routes** — Use Next.js middleware or per-page auth checks to protect affiliate dashboard routes.

4. **Route users based on group membership:**
   - **Affiliate users** → Affiliate dashboard
   - **All other authenticated users** → Generic "Open the app to access calculators" screen

### Proposed Web App Route Structure

```
/                     → Public landing page (existing)
/pricing              → Public pricing page (existing)
/contact              → Public contact page (existing)
/privacy              → Public privacy policy (existing)
/terms                → Public terms (existing)
/login                → Login page (new)
/affiliate/apply      → Public affiliate application form (new)
/affiliate/dashboard  → Protected: affiliate earnings, referrals, links (new)
/affiliate/payouts    → Protected: payout history (new)
/affiliate/settings   → Protected: payout method config (new)
/account              → Protected: generic "Open the app" screen (new)
```

### Authentication Implementation Approach

**Option A: Amplify UI Authenticator (faster)**
- Use `@aws-amplify/ui-react` `<Authenticator>` component
- Pre-built login/signup/forgot-password flows
- Themed to match your design system
- Works with Google/Apple social providers out of the box

**Option B: Custom auth pages (more control)**
- Build login/signup forms from scratch using `signIn()`, `signUp()`, `confirmSignUp()`, `signInWithRedirect()` from `aws-amplify/auth`
- Full control over UI/UX
- More development work but matches your existing design perfectly

**Recommendation:** Start with **Option A** (Amplify Authenticator) for speed. You can customize it extensively with Amplify UI's theming system to match your dark theme. Move to Option B later if you need more control.

### Post-Login Routing Logic

```
User logs in
  → Fetch user's Cognito groups (from JWT claims)
  → If groups include 'affiliate':
      → Redirect to /affiliate/dashboard
  → Else:
      → Redirect to /account (generic "Open the app" screen)
```

---

## Affiliate Marketing Implementation Options

### Option 1: Fully Custom (Build on Your Existing AWS Stack)

Build the entire affiliate system on your existing Cognito + Lambda + DynamoDB infrastructure.

**New Cognito Group:**
- `affiliate` — added to `amplify/auth/resource.ts` groups array

**New DynamoDB Tables:**

| Table | Primary Key | Purpose |
|-------|------------|---------|
| `AffiliateProfile` | `userId` | Affiliate account info, referral code, payout config, commission rate, status |
| `Referral` | `affiliateId` + `referralId` | Links affiliates to referred users |
| `Commission` | `affiliateId` + `commissionId` | Individual commission records tied to subscription events |
| `Payout` | `affiliateId` + `payoutId` | Payout batch records |
| `ClickEvent` | `affiliateId` + `clickTimestamp` | Affiliate link click tracking (TTL-enabled) |

**New Lambda Functions:**

| Function | Purpose |
|----------|---------|
| `applyForAffiliate` | Submit affiliate application (public, authenticated) |
| `approveAffiliate` | Admin: approve/reject applications, add user to `affiliate` Cognito group |
| `getAffiliateProfile` | Get affiliate's profile, stats, balance |
| `getAffiliateReferrals` | List referrals with status |
| `getAffiliateCommissions` | List commission history |
| `getAffiliatePayouts` | List payout history |
| `generateAffiliateLink` | Create/manage referral links and codes |
| `processAffiliatePayout` | Scheduled: batch process payouts via Stripe Connect or PayPal |
| `trackAffiliateClick` | Track link clicks (API Gateway endpoint) |

**Referral Tracking Flow:**
1. Affiliate shares link: `https://yourapp.com/?ref=CODE123`
2. Next.js middleware reads `ref` param, sets first-party cookie (30-day expiry), logs click
3. When user downloads app and signs up, mobile app reads referral code from:
   - Deep link parameter (if user tapped a universal link)
   - User-entered promo code field in onboarding
   - The existing `custom:referral_code` Cognito attribute (already defined in your schema)
4. Post-confirmation trigger or client sync creates a `Referral` record
5. On subscription purchase (RevenueCat webhook), the webhook handler:
   - Looks up `Referral` by `referredUserId`
   - Creates a `Commission` record with 30-day hold
   - On renewal, creates recurring commission
   - On refund/expiration, creates reversal commission

**Payout Processing:**
- EventBridge scheduled rule triggers `processAffiliatePayout` monthly
- Aggregates approved commissions per affiliate
- Executes payouts via Stripe Connect (transfer) or PayPal Payouts API
- Minimum payout threshold (e.g., $50)

**Pros:**
- Full control over commission logic, tracking, and payouts
- Unified with your existing Cognito/DynamoDB/Lambda stack
- No monthly SaaS fees (AWS costs only — likely under $10/month)
- Deep integration with RevenueCat webhooks (your existing webhook handler can be extended)
- The `custom:referral_code` attribute already exists in your Cognito user pool
- Can track across both web and mobile

**Cons:**
- Most development effort
- You own the payout compliance (1099 forms, tax reporting)
- Fraud detection is your responsibility
- Building the affiliate dashboard from scratch

---

### Option 2: GoMarketMe (Purpose-Built for Mobile Apps)

The only third-party platform found that explicitly supports RevenueCat-compatible mobile app affiliate marketing.

**How it works:**
- SDK integration into your iOS/Android app
- Cookieless, privacy-compliant tracking (no IDFA/ATT needed)
- Built-in mobile attribution — replaces the need for AppsFlyer/Adjust/Branch
- Handles recurring subscription commissions, free trials, cancellations, refunds
- Affiliates get their own dashboard portal
- Payouts via Stripe (one-click) or external

**Pricing:** Free (performance-based — they take a cut of successful affiliate sales). Enterprise plan available.

**Integration:**
- Add their SDK to your React Native/Expo app
- They handle tracking, attribution, commission calculation, and affiliate payouts
- You manage affiliate approvals and program rules

**Pros:**
- Minimal development effort for mobile affiliate tracking
- No monthly fees
- Handles payout compliance
- Built for the exact mobile app subscription model you have
- Expo SDK available

**Cons:**
- Doesn't cover web-originated referrals (only mobile deep links)
- You'd need a separate solution for web affiliate tracking
- Less control over commission logic
- Dependency on a third-party service
- Performance-based pricing means they take a percentage of every affiliate sale
- No Cognito integration — you'd need to bridge affiliate status manually

---

### Option 3: Rewardful or FirstPromoter (SaaS Affiliate Platforms)

Both are built for SaaS subscription businesses and integrate deeply with Stripe.

**Rewardful:**
- $49-149/month depending on affiliate revenue volume
- Deep Stripe integration (one-click setup)
- Clean affiliate links (`?via=name`)
- Built-in affiliate portal
- REST API for custom integrations

**FirstPromoter:**
- $49-149/month
- Supports Stripe, Paddle, Recurly, Braintree, Chargebee
- Two-sided rewards (reward both referrer and referred)
- Built-in fraud prevention
- Customizable affiliate dashboards
- Affiliate email marketing features

**How either would work with your stack:**
1. You would need to add **Stripe as a payment method** for web subscriptions (currently you only have RevenueCat for mobile IAP)
2. Rewardful/FirstPromoter tracks web-originated subscriptions through Stripe
3. For mobile app purchases (RevenueCat), you'd need a **custom webhook bridge**: RevenueCat webhook → your Lambda → Rewardful/FirstPromoter API to report the conversion
4. Affiliate portal is provided by the platform (embedded or standalone)

**Pros:**
- Pre-built affiliate dashboard and portal
- Handles payout compliance and tax reporting
- Fraud detection included
- Faster to launch than fully custom

**Cons:**
- Monthly fees ($49-149+)
- No native RevenueCat integration — requires custom bridge for mobile purchases
- Adds Stripe dependency for web (which you don't have today)
- Less control over commission logic
- Revenue caps on lower tiers

---

### Option 4: Hybrid — Custom Backend + GoMarketMe (Mobile) or Custom Backend + Rewardful (Web)

Combine a third-party platform for one channel with your custom backend for the other.

**Variant A: GoMarketMe (mobile) + Custom (web)**
- GoMarketMe handles mobile app affiliate attribution and tracking
- Custom DynamoDB/Lambda handles web referral tracking
- Unified affiliate dashboard in your Next.js app that aggregates both data sources

**Variant B: Rewardful (web) + Custom (mobile)**
- Rewardful handles web subscription affiliate tracking via Stripe
- Custom Lambda bridge forwards RevenueCat mobile events to Rewardful API
- Rewardful provides the affiliate portal

**Pros:**
- Leverages best-of-breed for each channel
- Reduces development effort vs. fully custom

**Cons:**
- Two systems to manage and keep in sync
- More complex architecture
- Affiliates may need to check two dashboards (unless you build a unified one)

---

### Option 5: Tapfiliate or Impact.com (Multi-Channel Platforms)

**Tapfiliate ($89-149/month):**
- Supports SaaS, e-commerce, subscription models
- REST API for conversion tracking, click tracking, refund handling
- White-label affiliate portal
- No direct RevenueCat integration but full API for custom event reporting

**Impact.com ($500-5000/month):**
- Enterprise-grade partnership platform
- 330K+ partner marketplace
- Advanced ML-based fraud detection
- App install tracking capabilities
- Overkill for most early/growth-stage companies

**Pros:**
- Multi-channel tracking (web + mobile via API)
- Large existing affiliate networks

**Cons:**
- Expensive (especially Impact.com)
- No RevenueCat integration — requires full custom bridge
- Impact.com uses redirect-based tracking that modern browsers increasingly block
- Reviews specifically warn against Impact.com for SaaS companies

---

## Comparison Matrix

| Criteria | Custom Build | GoMarketMe | Rewardful/FirstPromoter | Hybrid | Tapfiliate/Impact |
|----------|-------------|------------|------------------------|--------|------------------|
| **Monthly cost** | ~$5-10 (AWS) | Free (perf-based) | $49-149 | Varies | $89-5000 |
| **Mobile app tracking** | Custom build | Native | Custom bridge needed | Partial | Custom bridge needed |
| **Web tracking** | Custom build | No | Native (Stripe) | Partial | API-based |
| **RevenueCat integration** | You build it (extend existing webhook) | Compatible | Custom bridge | Partial | Custom bridge |
| **Cognito integration** | Native (same user pool) | None | None | Partial | None |
| **Affiliate dashboard** | Build it | Provided | Provided | Mixed | Provided |
| **Payout handling** | You manage | They handle | They handle | Mixed | They handle |
| **Tax compliance** | Your responsibility | They handle | They handle | Mixed | They handle |
| **Development effort** | High | Low (mobile only) | Medium | Medium-High | Medium |
| **Control** | Full | Limited | Limited | Mixed | Limited |
| **Time to launch** | Weeks | Days | Days-Week | Weeks | Days-Week |

---

## Recommended Architecture

Based on the analysis, here is the recommended approach:

### Phase 1: Foundation (Web Auth + Affiliate Application)

1. **Add `affiliate` group to Cognito** — Update `amplify/auth/resource.ts`
2. **Add web callback URLs** — Add your domain to `callbackUrls` and `logoutUrls`
3. **Add authentication to the web app** — Install `@aws-amplify/ui-react`, create login page
4. **Build the post-login routing** — Check groups, route to affiliate dashboard or generic account page
5. **Build the "Open the app" generic screen** — Simple page with App Store/Play Store links
6. **Build the affiliate application page** — Form at `/affiliate/apply` (public, requires login)
7. **Build admin affiliate approval** — Lambda + AppSync mutation to approve applications and add users to `affiliate` group

### Phase 2: Affiliate Tracking & Dashboard

Choose one of:

**Path A (Recommended for control): Fully Custom**
- Add DynamoDB tables for affiliates, referrals, commissions, payouts, clicks
- Extend the existing RevenueCat webhook handler to create commission records
- Build referral link tracking (Next.js middleware + API route)
- Build the affiliate dashboard pages
- Implement payout processing (Stripe Connect or PayPal)

**Path B (Recommended for speed): GoMarketMe + Custom Web Tracking**
- Integrate GoMarketMe SDK for mobile affiliate tracking
- Build custom web referral tracking on DynamoDB/Lambda
- Build a unified dashboard that displays data from both sources

**Path C (Recommended if adding Stripe for web): Rewardful + RevenueCat Bridge**
- Add Stripe billing for web subscriptions
- Use Rewardful for web affiliate tracking
- Build a Lambda bridge from RevenueCat webhooks to Rewardful API for mobile conversions

### Phase 3: Payouts & Compliance

- Implement payout processing (monthly batch via Stripe Connect or PayPal Payouts API)
- W-9/W-8BEN collection for affiliates
- 1099 reporting (if handling payouts yourself)
- Fraud detection rules (velocity checks, self-referral prevention)

---

## Key Decisions Needed

1. **Which implementation option?** Custom, GoMarketMe, Rewardful, or Hybrid?
2. **Commission structure?** Percentage of first payment? Recurring? Flat fee?
3. **Commission hold period?** 30 days is standard (protects against refunds/chargebacks)
4. **Minimum payout threshold?** $50 is common
5. **Payout method?** Stripe Connect, PayPal, or manual bank transfer?
6. **Will you add Stripe for web subscriptions?** This opens up Rewardful/FirstPromoter as options
7. **Deep linking service?** Branch.io, Firebase Dynamic Links, or custom universal links for mobile referral attribution?
