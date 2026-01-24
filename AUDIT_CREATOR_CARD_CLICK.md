# TASK 1: CREATOR CARD CLICK BEHAVIOR AUDIT

## 1. Current Click Handler Components

### Primary Components:
- **`app/[locale]/matchmaking/components/CreatorCard.tsx`** (Lines 40-102)
  - Handles individual card rendering
  - Accepts `onViewProfile: (id: string) => void` callback prop
  - Current click handler: `<button onClick={() => onViewProfile(card.id)}>`
  - Button text: "查看創作者名片" (zh-TW) / "View Creator Profile" (en)

- **`app/[locale]/matchmaking/components/CreatorCardList.tsx`** (Lines 1-47)
  - Renders grid (desktop) and horizontal swipe (mobile) layouts
  - Passes `onViewProfile` prop down to individual cards

- **`app/[locale]/matchmaking/page.tsx`** (Lines 1-69)
  - **Current behavior**: `onViewProfile={(id) => { console.log("View creator profile:", id) }}`
  - **Status**: Placeholder implementation, no actual navigation

## 2. Profile Page Routes

### Existing Routes:
- **`/[locale]/creator-card`** - Creator card editor/builder page (for creators to build their own card)
  - File: `app/[locale]/creator-card/page.tsx`
  - Purpose: Authenticated creators edit their own profile card
  - NOT a public profile viewer

### Expected Profile Route (NOT YET IMPLEMENTED):
- **`/[locale]/creator/[id]`** or **`/[locale]/creator-card/[id]`**
  - Currently DOES NOT EXIST
  - Mock data includes `profileUrl: "/creator/emma-chen"` etc.
  - Need to create this route for public profile viewing

## 3. Auth/Verification Mechanism

### Client-Side Auth State:
- **`app/lib/useInstagramMe.ts`** - Hook that fetches `/api/auth/instagram/me`
  - Returns: `{ status, loading, data, error }`
  - `status === 200` indicates authenticated
  - Used by `useAuthNavigation` hook

- **`app/lib/useAuthNavigation.ts`** - Shared auth navigation helper
  - Exposes: `{ isAuthenticated, loading, locale, navigateToProtected, navigateToResults, navigateToPostAnalysis }`
  - Already used in: DemoToolPanel, Matchmaking header, PostAnalysisClient, ResultsClient

### Auth Flow:
- OAuth via `/api/auth/instagram?provider=instagram&next=...`
- Callback: `/api/auth/instagram/callback`
- Session stored (likely cookies/Supabase)

## 4. Data Available on Card vs. Needs Fetching

### Currently Available on Card (from `types.ts`):
```typescript
interface CreatorCard {
  id: string
  displayName: string
  avatarUrl: string
  category: string
  followerCount: number
  engagementRate: number | null
  isVerified: boolean
  profileUrl: string  // ⚠️ Currently just a string, not used for navigation
}
```

### Mock Data Source:
- `app/[locale]/matchmaking/mockData.ts` - 8 sample creator cards
- All cards have basic info (name, avatar, category, metrics)

### Data That Would Need Fetching for Full Profile:
- Bio/description
- Portfolio items (images, videos)
- Collaboration history
- Detailed metrics (reach, impressions, audience demographics)
- Contact information
- Social media links
- Past brand partnerships

### Existing Creator Card API:
- **`/api/creator-card`** - GET creator card data
- **`/api/creator-card/upsert`** - POST/PUT creator card data
- **`/api/creator-card/me`** - GET current user's creator card
- **`/api/creator-card/public`** - Likely for public profile viewing (needs verification)

## 5. Summary

### Current State:
✅ Card UI component exists with click handler prop
✅ Auth mechanism available via `useAuthNavigation` hook
✅ Basic card data available (name, avatar, metrics)
❌ No actual navigation implemented (just console.log)
❌ No public profile page route exists yet
❌ No drawer/sheet component for details view
❌ No auth gate modal for restricted access

### Next Steps:
1. Create configurable `CardClickBehavior` enum
2. Implement profile page route (`/[locale]/creator/[id]`)
3. Create responsive drawer/sheet component for details view
4. Implement auth gate modal with login/verify CTAs
5. Wire up all behaviors with proper i18n and mobile-first UX
