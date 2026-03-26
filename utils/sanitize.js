/**
 * utils/sanitize.js
 *
 * Centralised input sanitizers for every TextInput field in the app.
 *
 * Each function is:
 *   • Pure — returns a new string, never mutates anything
 *   • Silent — silently removes disallowed characters rather than throwing
 *   • Safe to call on every keystroke (O(n), minimal allocation)
 *
 * ── Why sanitize on the client? ──────────────────────────────────────────────
 * React Native renders text via native Text/TextInput components — NOT HTML —
 * so XSS is not a concern here.  The goals are:
 *   1. Keep stored data clean and consistent (no null bytes, no control chars)
 *   2. Prevent malformed Firestore range queries via the username search field
 *   3. Cap field lengths before they reach Firestore (defence-in-depth on top
 *      of backend rules)
 *
 * ── Sanitizer reference ───────────────────────────────────────────────────────
 *
 *  sanitizeUsername(text)       Search / profile usernames  — [a-z0-9._], max 20
 *  sanitizeName(text)           Display names               — printable name chars, max 40
 *  sanitizePersonName(text)     First / last names          — same rules, max 30
 *  sanitizeSearch(text)         Gym / message search bars   — [a-zA-Z0-9 '.-&], max 50
 *  sanitizeFreeText(text, max)  Chat messages, reviews,     — strip control chars only
 *                               notes, report descriptions
 *  sanitizeAddress(text, max)   Gym addresses, city names   — printable address chars
 *  sanitizeState(text)          US state abbreviation       — [A-Z], max 2
 */

// ── sanitizeUsername ──────────────────────────────────────────────────────────

/**
 * Strips any character that is not a letter, digit, dot, or underscore, then
 * lower-cases the result and hard-caps at 20 characters.
 *
 * Matches the valid username character set enforced at account-creation time
 * (ClaimUsernameScreen / SignupScreen validation).  Using this on the search
 * field also prevents malformed prefix-range Firestore queries.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeUsername(text) {
  return text
    .replace(/[^a-zA-Z0-9._]/g, '') // strip disallowed chars
    .toLowerCase()                    // usernames are stored lower-cased
    .slice(0, 20);                    // hard cap
}

// ── sanitizeName ─────────────────────────────────────────────────────────────

/**
 * For display names (shown publicly on the app).
 * Allows letters (including accented), digits, spaces, apostrophes, hyphens,
 * and periods.  Strips leading whitespace and collapses double spaces.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeName(text) {
  return text
    .replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ0-9 '.\-]/g, '') // allowed: letters, digits, space, ' . -
    .replace(/^ +/, '')                             // no leading spaces
    .replace(/ {2,}/g, ' ')                         // collapse double spaces
    .slice(0, 40);
}

// ── sanitizePersonName ────────────────────────────────────────────────────────

/**
 * For first / last name fields.  Same rules as sanitizeName but capped at 30.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizePersonName(text) {
  return text
    .replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ '.\-]/g, '')
    .replace(/^ +/, '')
    .replace(/ {2,}/g, ' ')
    .slice(0, 30);
}

// ── sanitizeSearch ────────────────────────────────────────────────────────────

/**
 * For search bars that filter lists locally (gyms, messages).
 * Allows: letters, digits, space, apostrophe, hyphen, period, ampersand.
 * Strips leading spaces and collapses repeated spaces.
 *
 * Matches the inline sanitizeSearch already used in ViewRunsScreen.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeSearch(text) {
  return text
    .replace(/[^a-zA-Z0-9 '.\-&]/g, '')
    .replace(/^ +/, '')
    .replace(/ {2,}/g, ' ')
    .slice(0, 50);
}

// ── sanitizeFreeText ──────────────────────────────────────────────────────────

/**
 * For free-text fields: chat messages, run reviews, report descriptions, notes.
 *
 * Does NOT restrict characters — users should be able to type anything readable.
 * Only strips ASCII control characters (0x00–0x08, 0x0B–0x0C, 0x0E–0x1F, 0x7F)
 * that have no valid use in a text field and could corrupt stored data.
 * Tabs (0x09), line feeds (0x0A), and carriage returns (0x0D) are preserved
 * because they are meaningful in multi-line messages.
 *
 * @param {string} text
 * @param {number} max - Maximum character length (default 500)
 * @returns {string}
 */
export function sanitizeFreeText(text, max = 500) {
  return text
    // Strip non-printable control characters (preserves \t \n \r)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, max);
}

// ── sanitizeAddress ───────────────────────────────────────────────────────────

/**
 * For physical address fields (gym name, street address, city).
 * Allows: letters (including accented), digits, spaces, and common address
 * punctuation: period, comma, hyphen, apostrophe, #, /.
 *
 * @param {string} text
 * @param {number} max - Maximum character length
 * @returns {string}
 */
export function sanitizeAddress(text, max = 200) {
  return text
    .replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ0-9 .,\-'#/]/g, '')
    .replace(/^ +/, '')
    .replace(/ {2,}/g, ' ')
    .slice(0, max);
}

// ── sanitizeState ─────────────────────────────────────────────────────────────

/**
 * For US state abbreviation field.  Allows only letters, upper-cases the result,
 * and caps at 2 characters.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeState(text) {
  return text
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 2);
}
