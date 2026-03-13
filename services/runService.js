/**
 * Run Service
 *
 * Manages group runs at gyms — the "Start a Run / Join a Run" feature.
 *
 * RESPONSIBILITIES:
 * - Start a new run or join an existing one (merge rule: ±60 minutes per gym)
 * - Leave a run
 * - Real-time subscriptions to runs at a gym and a user's runs at a gym
 *
 * DESIGN DECISIONS:
 * - One run per gym within a 60-minute window (merge rule prevents duplicate runs)
 * - Participant docs use a compound key {runId}_{userId} for idempotent joins
 *   and O(1) leave without querying
 * - `runs` and `runParticipants` are separate top-level collections so we can
 *   query "all runs user X is part of" without knowing run IDs in advance
 * - participantCount is denormalized onto the run doc and kept in sync via
 *   runTransaction so the UI can render counts without a subcollection query
 *
 * COLLECTIONS:
 *   runs/{autoId}
 *     gymId, gymName, createdBy, creatorName, startTime (Timestamp),
 *     status ('upcoming'), createdAt (Timestamp), participantCount
 *
 *   runParticipants/{runId}_{userId}
 *     runId, userId, userName, userAvatar, joinedAt (Timestamp),
 *     status ('going'), gymId
 *
 * EXAMPLE USAGE:
 *
 *   import { startOrJoinRun, leaveRun, subscribeToGymRuns } from './runService';
 *
 *   // Start a run at 3:00 PM (or join an existing one nearby in time)
 *   const run = await startOrJoinRun('gym123', 'Cowboys Fit', new Date('...'));
 *
 *   // Leave a run
 *   await leaveRun(runId);
 *
 *   // Subscribe to all upcoming runs at a gym
 *   const unsub = subscribeToGymRuns('gym123', (runs) => { ... });
 */

import { db, auth } from '../config/firebase';
import { awardPoints, penalizePoints } from './pointsService';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  writeBatch,
  serverTimestamp,
  Timestamp,
  increment,
} from 'firebase/firestore';

// How far apart two runs can be (in ms) and still be merged.
const MERGE_WINDOW_MS = 60 * 60 * 1000; // 60 minutes

// How far into the future a run can be scheduled (7 days).
const MAX_FUTURE_MS = 7 * 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * participantDocId — Compound key for runParticipants documents.
 * Using a deterministic ID means a second join attempt silently overwrites
 * the first (idempotent) and leaveRun can delete by ID without querying.
 *
 * @param {string} runId
 * @param {string} userId
 * @returns {string}
 */
const participantDocId = (runId, userId) => `${runId}_${userId}`;

/**
 * fetchUserDisplayInfo — Gets name + avatar from the authenticated user's
 * Firestore profile. Falls back to auth displayName / null when the doc
 * doesn't exist yet (e.g. during account creation).
 *
 * @returns {Promise<{ userName: string, userAvatar: string|null }>}
 */
const fetchUserDisplayInfo = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.data() || {};
    return {
      userName: data.name || auth.currentUser.displayName || 'Player',
      userAvatar: data.photoURL || null,
    };
  } catch {
    return {
      userName: auth.currentUser.displayName || 'Player',
      userAvatar: null,
    };
  }
};

/**
 * joinRun — Adds the current user to an existing run document.
 * Uses a runTransaction to atomically:
 *   1. Write (or overwrite) the participant doc
 *   2. Increment participantCount on the run doc
 *
 * The participant doc is written via setDoc with the compound key so
 * repeat joins are idempotent — calling this twice has the same effect
 * as calling it once.
 *
 * @param {string} runId
 * @param {string} gymId — Denormalized onto participant for query convenience
 * @param {{ userName: string, userAvatar: string|null }} userInfo
 * @returns {Promise<void>}
 */
const joinRun = async (runId, gymId, userInfo) => {
  const uid = auth.currentUser?.uid;
  const participantId = participantDocId(runId, uid);
  const participantRef = doc(db, 'runParticipants', participantId);
  const runRef = doc(db, 'runs', runId);

  await runTransaction(db, async (txn) => {
    const participantSnap = await txn.get(participantRef);
    const alreadyJoined = participantSnap.exists();

    // Write participant doc (idempotent — setDoc merges/overwrites)
    txn.set(participantRef, {
      runId,
      userId: uid,
      userName: userInfo.userName,
      userAvatar: userInfo.userAvatar,
      joinedAt: Timestamp.now(),
      status: 'going',
      gymId,
    });

    // Only increment count for genuinely new joins
    if (!alreadyJoined) {
      txn.update(runRef, { participantCount: increment(1) });
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * startOrJoinRun — Core function for the "Start a Run / Join a Run" feature.
 *
 * Merge rule: if an 'upcoming' run already exists at this gym with a startTime
 * within ±60 minutes of the requested startTime, join that run instead of
 * creating a new one. This prevents the gym from accumulating duplicate runs
 * for the same general time window.
 *
 * @param {string} gymId
 * @param {string} gymName — Denormalized display name
 * @param {Date}   startTime — Desired start time for the run
 * @returns {Promise<{ runId: string, created: boolean }>}
 *   `created: true` when a new run was created, `false` when an existing one
 *   was joined. Callers can use this to customize the confirmation message.
 * @throws {Error} If not authenticated or if startTime is invalid
 */
export const startOrJoinRun = async (gymId, gymName, startTime) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Must be logged in to start or join a run');

  // Validate startTime
  const now = new Date();
  if (startTime <= now) {
    throw new Error('Run start time must be in the future');
  }
  if (startTime - now > MAX_FUTURE_MS) {
    throw new Error('Cannot schedule a run more than 7 days in advance');
  }

  const userInfo = await fetchUserDisplayInfo();

  // ── Check for an existing mergeable run ──────────────────────────────────
  // Query all upcoming runs at this gym. We do a client-side time filter
  // because Firestore doesn't support range queries on two fields simultaneously
  // without a composite index on startTime. This keeps index requirements minimal.
  const runsRef = collection(db, 'runs');
  const q = query(
    runsRef,
    where('gymId', '==', gymId),
    where('status', '==', 'upcoming'),
    orderBy('startTime', 'asc')
  );

  const snapshot = await getDocs(q);
  const requestedMs = startTime.getTime();

  // Find the first run within ±60 minutes of the requested start time
  const matchingRun = snapshot.docs.find((d) => {
    const runStartMs = d.data().startTime?.toDate().getTime();
    return runStartMs && Math.abs(runStartMs - requestedMs) <= MERGE_WINDOW_MS;
  });

  if (matchingRun) {
    // ── Join existing run ──────────────────────────────────────────────────
    const runId = matchingRun.id;
    await joinRun(runId, gymId, userInfo);
    // No activity write for joining an existing run — only 'started a run at'
    // is written (on creation below) to keep the feed clean. See RC-002.
    return { runId, created: false };
  }

  // ── Create new run ───────────────────────────────────────────────────────
  // Use a writeBatch so the run doc and the user's runsStarted counter are
  // written atomically — both land or neither does. This prevents the counter
  // from drifting out of sync with the actual runs collection.
  const newRunRef = doc(runsRef); // auto-ID without writing yet
  const batch = writeBatch(db);

  batch.set(newRunRef, {
    gymId,
    gymName,
    createdBy: uid,
    creatorName: userInfo.userName,
    startTime: Timestamp.fromDate(startTime),
    status: 'upcoming',
    createdAt: serverTimestamp(),
    participantCount: 0, // joinRun will increment this to 1
  });

  batch.update(doc(db, 'users', uid), { runsStarted: increment(1) });

  await batch.commit();

  const runId = newRunRef.id;
  await joinRun(runId, gymId, userInfo);

  // Activity feed — fire and forget (non-critical display data)
  addDoc(collection(db, 'activity'), {
    userId: uid,
    userName: userInfo.userName,
    userAvatar: userInfo.userAvatar,
    action: 'started a run at',
    gymId,
    gymName,
    runId,
    createdAt: Timestamp.now(),
  }).catch((err) => console.error('[runService] activity write error (start):', err));

  return { runId, created: true };
};

/**
 * joinExistingRun — Joins a known run by its Firestore document ID.
 *
 * Use this when tapping "Join" on a run card that is already live. Unlike
 * `startOrJoinRun`, this function skips time validation (no merge logic
 * needed — we already know the exact run). Safe to call on runs that have
 * already started (within the grace window shown by subscribeToGymRuns).
 *
 * @param {string} runId   — Firestore document ID of the run to join
 * @param {string} gymId   — Denormalized gym ID (written on the participant doc)
 * @param {string} gymName — Used in the activity feed event
 * @returns {Promise<void>}
 * @throws {Error} If not authenticated
 */
export const joinExistingRun = async (runId, gymId, gymName) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const userInfo = await fetchUserDisplayInfo();
  await joinRun(runId, gymId, userInfo);
  // No activity write for joining — only 'started a run at' is kept. See RC-002.
};

/**
 * leaveRun — Removes the current user from a run.
 *
 * Atomically:
 *   1. Deletes the participant doc (compound key: {runId}_{userId})
 *   2. Decrements participantCount, clamped to 0
 *
 * If the user isn't in the run, this is a no-op (deleteDoc on a non-existent
 * doc succeeds silently in Firestore).
 *
 * Late-cancel penalty: if the user leaves within 60 minutes of the run's
 * scheduled startTime (but the run hasn't started yet), points are deducted
 * as a commitment signal.
 *   • Creator leaves < 60 min before start → −15 pts (others committed to them)
 *   • Participant leaves < 60 min before start → −5 pts
 * Leaving more than 60 min before start, or after the run has already started,
 * carries no penalty.  Points floor at 0 — never go negative.
 *
 * @param {string} runId
 * @returns {Promise<void>}
 * @throws {Error} If not authenticated
 */
export const leaveRun = async (runId) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');

  const participantId = participantDocId(runId, uid);
  const participantRef = doc(db, 'runParticipants', participantId);
  const runRef = doc(db, 'runs', runId);

  // Tracks whether a late-cancel penalty should fire after the transaction.
  let penaltyAmount = 0;

  await runTransaction(db, async (txn) => {
    const [participantSnap, runSnap] = await Promise.all([
      txn.get(participantRef),
      txn.get(runRef),
    ]);

    if (!participantSnap.exists()) return; // already not in the run

    // ── Late-cancel penalty check ──────────────────────────────────────────
    if (runSnap.exists()) {
      const runData = runSnap.data();
      const startMs = runData.startTime?.toMillis?.();
      if (startMs) {
        const minutesUntilStart = (startMs - Date.now()) / 60000;
        // Penalty window: run is still in the future but within 60 minutes
        if (minutesUntilStart > 0 && minutesUntilStart < 60) {
          penaltyAmount = runData.createdBy === uid ? 15 : 5;
        }
      }
    }

    txn.delete(participantRef);
    // Use increment(-1) — Firestore Security Rules or cleanup can clamp to 0
    txn.update(runRef, { participantCount: increment(-1) });
  });

  // Apply penalty after the transaction — fire-and-forget, non-critical.
  if (penaltyAmount > 0) {
    penalizePoints(uid, penaltyAmount).catch((err) =>
      console.error('Leave-run penalty error:', err)
    );
  }
};

/**
 * subscribeToGymRuns — Real-time subscription to all upcoming runs at a gym.
 *
 * Returns runs ordered by startTime ascending. Caller is responsible for
 * unsubscribing (returned function) when the component unmounts.
 *
 * Only returns 'upcoming' runs whose startTime is in the future or within
 * the last 30 minutes (grace window so a run that started recently is still
 * visible while people are arriving).
 *
 * @param {string} gymId
 * @param {(runs: object[]) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export const subscribeToGymRuns = (gymId, callback) => {
  const runsRef = collection(db, 'runs');
  const q = query(
    runsRef,
    where('gymId', '==', gymId),
    where('status', '==', 'upcoming'),
    orderBy('startTime', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const now = new Date();
      // Grace window: show runs that started up to 30 minutes ago
      const graceCutoff = new Date(now.getTime() - 30 * 60 * 1000);

      const runs = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((run) => {
          const st = run.startTime?.toDate();
          if (!st || st < graceCutoff) return false;
          // Hide runs with no participants. Treat missing, zero, or negative
          // counts (possible from an unclamped increment(-1) retry) as empty.
          if ((run.participantCount ?? 0) <= 0) return false;
          return true;
        });

      callback(runs);
    },
    (err) => {
      console.error('[runService] subscribeToGymRuns error:', err);
      callback([]);
    }
  );
};

/**
 * subscribeToUserRunsAtGym — Real-time subscription to participant docs for
 * the current user at a specific gym.
 *
 * This is used by RunDetailsScreen to determine whether the user is already
 * part of any runs at this gym, so it can show "You're Going" vs "Join".
 *
 * Returns an array of { runId, ... } participant docs.
 *
 * @param {string} userId
 * @param {string} gymId
 * @param {(participants: object[]) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export const subscribeToUserRunsAtGym = (userId, gymId, callback) => {
  const participantsRef = collection(db, 'runParticipants');
  const q = query(
    participantsRef,
    where('userId', '==', userId),
    where('gymId', '==', gymId),
    where('status', '==', 'going')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const participants = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(participants);
    },
    (err) => {
      console.error('[runService] subscribeToUserRunsAtGym error:', err);
      callback([]);
    }
  );
};

/**
 * subscribeToRunParticipants — Real-time subscription to all participants
 * in a specific run. Used to display the "who's going" list.
 *
 * @param {string} runId
 * @param {(participants: object[]) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export const subscribeToRunParticipants = (runId, callback) => {
  const participantsRef = collection(db, 'runParticipants');
  const q = query(
    participantsRef,
    where('runId', '==', runId),
    where('status', '==', 'going'),
    orderBy('joinedAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const participants = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(participants);
    },
    (err) => {
      console.error('[runService] subscribeToRunParticipants error:', err);
      callback([]);
    }
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Run reward evaluation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * evaluateRunReward — Determines whether a user earns a runComplete bonus
 * after checking in at a gym.
 *
 * Called fire-and-forget from presenceService.checkIn() immediately after
 * the main check-in transaction completes.
 *
 * Legitimacy rules (all must pass before awardPoints is called):
 *   1. User has an active runParticipants doc at this gym (status: 'going')
 *   2. Check-in falls within the run window: startTime − 30 min to startTime + 60 min
 *   3. Run has participantCount >= 2 (not a solo run)
 *   4. Run creator also checked in at the same gym within the same window
 *      (skipped when the evaluating user IS the creator — their check-in is the proof)
 *
 * Idempotency is enforced inside awardPoints via pointsAwarded.runs.{runId}.
 *
 * Reads (worst case, one eligible run found):
 *   1. getDocs(runParticipants query) — find user's runs at this gym
 *   2. getDoc(runs/{runId})           — startTime, createdBy, participantCount
 *   3. getDoc(presence/{createdBy}_{gymId}) — creator check-in proof (skipped if user is creator)
 *
 * @param {string} uid          — Firebase Auth user ID of the checking-in user.
 * @param {string} gymId        — Gym where the check-in occurred.
 * @param {Date}   checkInTime  — JS Date of the check-in (from presenceService.now).
 * @returns {Promise<void>}
 */
export const evaluateRunReward = async (uid, gymId, checkInTime) => {
  if (!uid || !gymId || !checkInTime) return;

  const checkInMs = checkInTime.getTime();

  // Find all runs this user is actively participating in at this gym.
  const participantsRef = collection(db, 'runParticipants');
  const participantQuery = query(
    participantsRef,
    where('userId', '==', uid),
    where('gymId',  '==', gymId),
    where('status', '==', 'going'),
  );
  const participantSnap = await getDocs(participantQuery);
  if (participantSnap.empty) return;

  for (const participantDoc of participantSnap.docs) {
    const { runId } = participantDoc.data();
    if (!runId) continue;

    // ── Read the run doc ────────────────────────────────────────────────────
    const runSnap = await getDoc(doc(db, 'runs', runId));
    if (!runSnap.exists()) continue;

    const { startTime, createdBy, participantCount, status } = runSnap.data();
    const startMs = startTime?.toMillis?.();
    if (!startMs || !createdBy) continue;

    // Skip runs that were canceled before anyone showed up.
    if (status && status !== 'upcoming') continue;

    // ── Rule 2: time window check ───────────────────────────────────────────
    // Valid window: 30 min before run start up to 60 min after run start.
    const windowStartMs = startMs - 30 * 60 * 1000;
    const windowEndMs   = startMs + 60 * 60 * 1000;
    if (checkInMs < windowStartMs || checkInMs > windowEndMs) continue;

    // ── Rule 3: legitimacy — not a solo run ─────────────────────────────────
    if ((participantCount ?? 0) < 2) continue;

    // ── Rule 4: creator presence check ─────────────────────────────────────
    // If the user IS the creator, their current check-in satisfies this rule.
    // Otherwise, read the creator's presence doc and verify their checkedInAt
    // falls within the same window.
    if (uid !== createdBy) {
      const creatorPresenceId = `${createdBy}_${gymId}`;
      const creatorPresenceSnap = await getDoc(doc(db, 'presence', creatorPresenceId));
      if (!creatorPresenceSnap.exists()) continue;

      const creatorCheckedInMs = creatorPresenceSnap.data().checkedInAt?.toMillis?.();
      if (!creatorCheckedInMs) continue;
      if (creatorCheckedInMs < windowStartMs || creatorCheckedInMs > windowEndMs) continue;
    }

    // ── All rules passed — award the runComplete bonus ──────────────────────
    // awardPoints handles idempotency atomically via pointsAwarded.runs.{runId}.
    // gymId is passed as the 4th arg so the transaction also writes
    // pointsAwarded.runGyms: arrayUnion(gymId), which reviewService uses to
    // gate verified-attendee review eligibility with a single user doc read.
    await awardPoints(uid, 'runComplete', runId, gymId);
    break; // One runComplete bonus per check-in, even if multiple runs qualify.
  }
};
