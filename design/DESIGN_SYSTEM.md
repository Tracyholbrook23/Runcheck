# Runcheck App Design System

## Project Overview

Runcheck is a mobile app that helps users find and discover pickup basketball games in their local area. The app is built for basketball enthusiasts who want to quickly find where players are currently playing or where they're scheduled to play in their city.

**Design Philosophy:** Clean, minimal, approachable, and energetic. Streetball casual vibe without being overwhelming.

---

## User Actions & Core Flows

Users interact with the app in this primary order:

1. **Open App** → See list of nearby gyms
2. **Browse Gyms** → View live player counts and scheduled games
3. **Compare Gyms** → See which gyms are active now vs. later
4. **View Patterns** → Check historical data (what days/times are busier)
5. **Make Decision** → Choose which gym to go to based on live activity and patterns

### Key Data Points Displayed

- Live player count at each gym (anonymous)
- Number of players scheduled for future times (anonymous)
- Historical activity patterns (busiest days/times by day of week)
- **No player names or profiles shown** (privacy/safety first)

---

## Color Palette

### Primary Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| **Orange** | `#FF6B35` | Energetic, streetball vibe. Use for CTAs, highlights, live indicators |
| **Blue** | `#0084FF` | Trust, calm. Use for secondary actions, scheduled events |
| **White** | `#FFFFFF` | Clean, minimal. Primary background |
| **Dark Gray** | `#1A1A1A` | Text, structure, readability |

### Secondary Colors

| Color | Hex Code | Usage |
|-------|----------|-------|
| **Light Gray** | `#F5F5F5` | Subtle backgrounds, dividers |
| **Medium Gray** | `#888888` | Secondary text, less urgent info |

### Color Usage Rules

- ✅ **Orange** for active/live indicators (players currently playing)
- ✅ **Blue** for scheduled/future events
- ✅ **Neutral grays** for historical data
- ✅ Ensure contrast ratios meet **WCAG AA** (4.5:1 minimum for text)

---

## Typography

**Font Philosophy:** Neutral and approachable, modern but friendly

**Recommended Font:** Inter, SF Pro Display, or Roboto (system font fallback)

### Type Scale

| Style | Weight | Size | Usage |
|-------|--------|------|-------|
| **Headline (H1)** | Bold 700 | 28-32px | Page titles |
| **Section Header (H2)** | Semi-bold 600 | 22px | Section titles |
| **Subheader (H3)** | Semi-bold 600 | 18px | Card headers |
| **Body Text** | Regular 400 | 16px | Main content |
| **Small Body** | Regular 400 | 14px | Supporting text |
| **Caption/Label** | Regular 400 | 12px | Labels, metadata |
| **CTA Button Text** | Semi-bold 600 | 16px | Button text |

---

## Component Library & Interactions

### 1. Gym List Cards

**Display:** Gym name, live player count (orange badge), scheduled count (blue badge), distance

**Interaction:** Tap to expand and see more details

**Animation:** Smooth expand/collapse (200-300ms fade-in)

**Haptic:** Light tap on card selection

**Visual State:** Subtle shadow or border increase on active gym

**Spacing:** 12px between cards, 16px padding inside

---

### 2. Live Player Count Badge

**Design:** Large orange circle with white text showing number

**Label:** "Playing Now" subtitle

**Animation:** Subtle pulse animation (1.5s cycle) when count changes

**Haptic:** Medium feedback when count updates

**Size:** 60-80px diameter

---

### 3. Scheduled Players Section

**Design:** Blue-accented card showing future time slots

**Layout:** Time + player count (e.g., "6:00 PM - 8 players going")

**Interaction:** Tap to see details

**Animation:** Smooth fade-in with slight slide-up (250ms)

**Colors:** Blue text/accent, white background

---

### 4. Historical Activity Chart

**Design:** Simple bar chart or heatmap by day of week (Mon-Sun)

**Colors:** Orange for peak times, light gray for lighter times

**Interaction:** Tap on specific day to see breakdown

**Animation:** Bars animate in from bottom on load (staggered 100ms)

**Haptic:** Light feedback on day selection

---

### 5. Action Buttons (CTAs)

**Design:** Bold, full-width, 12px border-radius

**Colors:**
- Orange primary (white text)
- Blue secondary (white text)

**States:**
- Default
- Pressed (scale 0.98, increased shadow)
- Disabled (gray)

**Animation:** Smooth scale on tap (100-150ms)

**Haptic:** Strong feedback on tap

**Labels:** Action-oriented ("Join Game," "View Details," "Set Reminder")

**Min Touch Target:** 44x44pt

---

### 6. Icon Set

**Style:** Simplified, bold stroke-based (2-3px stroke) or filled

**Aesthetic:** Urban, modern streetball feel

**Consistency:** All icons same visual weight

**Colors:** Orange, blue, dark gray contextually

#### Required Icons

- Location/Map pin
- Clock/Time
- People/Players count
- Heart/Favorite
- Settings/Gear
- Back/Chevron
- Filter/Funnel
- Calendar/History
- Map/List view toggle
- Share icon

---

### 7. Animations & Transitions

| Element | Animation | Duration | Easing |
|---------|-----------|----------|--------|
| **Page Transitions** | Fade or subtle slide-up | 150-200ms | Ease-in-out |
| **Button Feedback** | Scale 1.0 → 0.98 → 1.0 | 100-150ms | Ease-in-out |
| **Data Updates** | Smooth number animations | 300ms | Ease-in-out |
| **Loading States** | Skeleton loaders with pulse | 1.2s cycle | Linear |
| **Empty States** | Friendly illustrated empty state | - | - |

**Easing:** Ease-in-out for most animations

---

## Haptic Feedback Strategy

| Interaction | Haptic Type | Usage |
|-------------|-------------|-------|
| **Light Tap** | Light | Card selection, scrolling, minor state changes |
| **Medium Tap** | Medium | Button presses, filter changes, time slot selection |
| **Strong Tap** | Strong | Joining a game, primary actions, confirmations |
| **Pulse** | Continuous | When live data updates (count changes) |

**Note:** All haptic should be optional/toggleable in settings and paired with visual feedback.

---

## Custom Illustrations

**Style:** Streetball casual, urban vibe, approachable

### Characteristics

- Simplified line art or filled shapes (not photo-realistic)
- Basketball culture focused (players in action, courts, urban energy)
- Use app colors (orange, blue, white, dark gray)
- Consistent line weight and artistic style
- Modern, energetic but clean

### Use Cases

- Empty state (no games found)
- Onboarding screens
- Success states ("Game joined!")
- Error states
- Historical data visualizations

---

## Layout & Spacing

### Spacing System (8px baseline)

| Size | Value | Usage |
|------|-------|-------|
| **XS** | 4px | Tight spacing |
| **S** | 8px | Small gaps |
| **M** | 16px | Standard padding |
| **L** | 24px | Section spacing |
| **XL** | 32px | Large gaps |

### Card Design

- **Padding:** 16px horizontal, 12-16px vertical
- **Spacing between cards:** 12px
- **Border Radius:** 12px
- **Shadow:** Subtle

### Button Dimensions

- **Height:** 48-56px
- **Padding:** 16px horizontal
- **Border Radius:** 8px
- **Width:** Full width on mobile

**Grid:** 8px baseline for all alignment

---

## Accessibility & Inclusivity

✅ **Requirements:**

- Color contrast meets WCAG AA (4.5:1 minimum)
- Icons paired with text labels
- Touch targets minimum 44x44pt
- Support dynamic type sizing
- Color never sole indicator of state
- Haptic has visual alternatives
- Clear loading and error states
- Support dark mode (light primary)

---

## Design Consistency Rules

1. ✅ Every interactive element has clear feedback (visual + haptic)
2. ✅ Color usage consistent throughout app
3. ✅ Typography hierarchy obvious and predictable
4. ✅ All animations related (similar timing, easing)
5. ✅ Empty/error states follow same design language
6. ✅ Icons paired with readable labels
7. ✅ Spacing uses 8px grid consistently
8. ✅ Button styles unified
9. ✅ Card styles unified
10. ✅ No random color variations

---

## Brand Voice

Runcheck should feel:

- ✅ Energetic but not chaotic
- ✅ Friendly and approachable
- ✅ Clean and minimal
- ✅ Urban and authentic
- ✅ Quick to understand
- ✅ Trustworthy and safe

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Update color constants
- [ ] Update typography scale
- [ ] Create spacing system
- [ ] Define component base styles

### Phase 2: Components
- [ ] Gym list cards
- [ ] Player count badges
- [ ] Schedule cards
- [ ] Action buttons
- [ ] Loading states
- [ ] Empty states

### Phase 3: Interactions
- [ ] Animations
- [ ] Haptic feedback
- [ ] Transitions
- [ ] Micro-interactions

### Phase 4: Polish
- [ ] Accessibility audit
- [ ] Dark mode support
- [ ] Custom illustrations
- [ ] Icon set
