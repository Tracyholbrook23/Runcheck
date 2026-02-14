# Theme Audit: Current vs Design System

## Color Comparison

| Element | Current | Design System | Status |
|---------|---------|---------------|--------|
| **Primary Orange** | `#E8622A` | `#FF6B35` | ❌ Needs update |
| **Secondary Blue** | `#2563EB` | `#0084FF` | ❌ Needs update |
| **Dark Gray** | `#1F2937` | `#1A1A1A` | ❌ Needs update |
| **Light Gray** | `#F5F6F8` | `#F5F5F5` | ✅ Close enough |
| **Medium Gray** | `#6B7280` | `#888888` | ❌ Needs update |
| **White** | `#FFFFFF` | `#FFFFFF` | ✅ Matches |

## Typography Comparison

| Element | Current | Design System | Status |
|---------|---------|---------------|--------|
| **Title** | 24px | 28-32px (H1) | ❌ Needs update |
| **Subtitle** | 20px | 22px (H2) | ❌ Needs update |
| **Body** | 16px | 16px | ✅ Matches |
| **Small** | 14px | 14px | ✅ Matches |
| **XS/Caption** | 12px | 12px | ✅ Matches |

**Missing:** H3 (18px, semi-bold 600)

## Spacing Comparison

| Element | Current | Design System | Status |
|---------|---------|---------------|--------|
| **XS** | 8px | 4px | ❌ Needs 4px added |
| **SM** | 12px | 8px | ❌ Different naming |
| **MD** | 16px | 16px | ✅ Matches |
| **LG** | 24px | 24px | ✅ Matches |
| **XL** | 32px | 32px | ✅ Matches |

**Issue:** Design system uses 8px baseline strictly (4, 8, 16, 24, 32)

Current uses 12px which doesn't fit the 8px grid

## Border Radius Comparison

| Element | Current | Design System | Status |
|---------|---------|---------------|--------|
| **Cards** | 16px (lg) | 12px | ❌ Needs update |
| **Buttons** | 16px (lg) | 8px | ❌ Needs update |

## Button Dimensions

| Element | Current | Design System | Status |
|---------|---------|---------------|--------|
| **Height** | 48px (md) | 48-56px | ✅ Matches |
| **Padding** | 16px | 16px | ✅ Matches |

---

## Recommendations

### Phase 1: Update Core Colors ✅
- Change primary orange to `#FF6B35`
- Change secondary blue to `#0084FF`
- Update dark gray to `#1A1A1A`
- Update medium gray to `#888888`

### Phase 2: Update Typography ✅
- Add H1: 28-32px
- Update H2 to 22px
- Add H3: 18px, semi-bold 600
- Add font weight constants

### Phase 3: Fix Spacing System ✅
- Add 4px to spacing scale
- Consider renaming for clarity
- Ensure 8px grid compliance

### Phase 4: Update Border Radius ✅
- Change card radius to 12px
- Change button radius to 8px

### Phase 5: Add Missing Constants
- Animation durations
- Haptic feedback mappings
- Touch target minimums (44x44pt)

---

## Impact Analysis

### Low Risk Changes
- Color updates (visual only)
- Typography sizes (responsive)
- Spacing adjustments (layout shifts minimal)

### Medium Risk Changes
- Border radius (affects visual perception)
- Button dimensions (may affect tap targets)

### High Risk Changes
- None identified

---

## Migration Strategy

1. ✅ **Update theme constants** (non-breaking)
2. ⚠️ **Test on device** (verify visual changes)
3. ⚠️ **Update components gradually** (one at a time)
4. ✅ **Document changes** (for team reference)
