/**
 * TrimClipScreen.js — Preview / Post screen with on-device trim
 *
 * Flow:
 *   1. Autoplays the clip immediately so the user sees what they recorded.
 *   2. If the source video is longer than MAX_CLIP_DURATION_SEC (10 s):
 *        - Shows a trim bar below the video.
 *        - Default selection: first 10 seconds.
 *        - User drags left/right handles to choose the segment to post.
 *        - Video loops within the selected range for preview.
 *   3. If the source video is ≤ 10 seconds: no trim UI, posts as-is.
 *   4. Post Clip:
 *        a. If trim needed: trimVideo() produces a new local MP4.
 *        b. createClipSession reserves the backend slot.
 *        c. Upload trimmed (or original) file to Firebase Storage.
 *        d. finalizeClipUpload marks the clip ready.
 *        e. Navigate back to RunDetails, scroll to clips section.
 *
 * Session creation is deferred to the moment the user taps Post Clip.
 * Backing out of this screen at any point before that tap is completely safe.
 *
 * Route params:
 *   - sourceVideoUri {string}       — Local file URI of the video to post
 *   - gymId          {string}       — Firestore gym ID
 *   - gymName        {string|null}  — Display name shown in header
 *   - presenceId     {string|null}  — Compound session key forwarded to
 *                                     createClipSession for per-session dedup
 *
 * After a successful post, navigates back to RunDetails with scrollToClips:true.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  PanResponder,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { hapticSuccess } from '../utils/haptics';
import { getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { trimVideo } from 'video-trimmer';
import { useAuth } from '../hooks';
import { db } from '../config/firebase';

// ── Constants ──────────────────────────────────────────────────────────────────
/** Maximum duration of a posted clip in seconds. Source videos longer than this
 *  will show the trim UI; shorter ones post as-is. */
const MAX_CLIP_DURATION_SEC = 10;

/** Visual width of each drag handle in logical pixels. */
const HANDLE_W = 22;

// ── Upload / processing states ─────────────────────────────────────────────────
const IDLE       = 'idle';
const TRIMMING   = 'trimming';   // on-device trim in progress
const CREATING   = 'creating';   // createClipSession in-flight
const UPLOADING  = 'uploading';
const FINALIZING = 'finalizing';

const FUNCTIONS_REGION = 'us-central1';

/** Predefined clip categories — order matches the chip row display. */
const CLIP_CATEGORIES = [
  { key: 'vibe',      label: 'Vibe' },
  { key: 'highlight', label: 'Highlight' },
  { key: 'energy',    label: 'Energy' },
  { key: 'funny',     label: 'Funny' },
];
const MAX_CAPTION_LENGTH = 100;
const MAX_TAGGED_PLAYERS = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────
function serializeError(err) {
  if (!err) return 'undefined error';
  try { return JSON.stringify(err, Object.getOwnPropertyNames(err), 2); }
  catch { return String(err); }
}

/** Format seconds as "12.3s" for the trim time labels. */
function formatSec(s) {
  const whole = Math.floor(s);
  const frac  = Math.floor((s - whole) * 10);
  return `${whole}.${frac}s`;
}

// ──────────────────────────────────────────────────────────────────────────────

export default function TrimClipScreen({ route, navigation }) {
  const { sourceVideoUri, gymId, gymName, presenceId } = route.params ?? {};

  // ── Video playback ────────────────────────────────────────────────────────
  const [isPlaying,  setIsPlaying]  = useState(true);
  const [videoReady, setVideoReady] = useState(false);

  // ── Video duration (populated once the player loads) ──────────────────
  const [videoDuration, setVideoDuration] = useState(0);
  const videoDurationRef                  = useRef(0);

  // expo-video player — autoplay on mount, periodic time updates for trim looping
  const player = useVideoPlayer(sourceVideoUri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.1; // 100ms updates for smooth trim-range looping
    p.play();
  });

  // ── Trim state ────────────────────────────────────────────────────────────
  // trimStart / trimEnd are in seconds and drive the trim bar rendering.
  // The matching refs are read inside PanResponder handlers to avoid stale
  // closures — PanResponder is created once on mount.
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd,   setTrimEnd]   = useState(MAX_CLIP_DURATION_SEC);
  const trimStartRef              = useRef(0);
  const trimEndRef                = useRef(MAX_CLIP_DURATION_SEC);

  // ── Trim bar layout ───────────────────────────────────────────────────────
  const [barWidth, setBarWidth] = useState(0);
  const barWidthRef             = useRef(0);

  // True once we know the source is longer than the clip limit
  const needsTrim = videoDuration > MAX_CLIP_DURATION_SEC;

  // ── Upload state ──────────────────────────────────────────────────────────
  const [uploadState, setUploadState] = useState(IDLE);
  const isLoading = uploadState !== IDLE;

  // ── Upload progress (0-100, shown during UPLOADING state) ─────────────────
  const [uploadProgress, setUploadProgress] = useState(0);

  // ── Caption + category (optional metadata) ─────────────────────────────────
  const [caption, setCaption]   = useState('');
  const [category, setCategory] = useState(null); // null = none selected

  // ── Player tagging ─────────────────────────────────────────────────────────
  const { userId: currentUid } = useAuth();
  const [taggedPlayers, setTaggedPlayers] = useState([]); // Array<{ uid, displayName, photoURL }>
  const [friendsList, setFriendsList]     = useState([]); // Array<{ uid, displayName, photoURL }>
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState('');

  // Fetch current user's friends list with display names
  useEffect(() => {
    if (!currentUid) return;
    let cancelled = false;

    (async () => {
      setFriendsLoading(true);
      try {
        const userSnap = await getDoc(doc(db, 'users', currentUid));
        if (cancelled || !userSnap.exists()) { setFriendsLoading(false); return; }
        const friendUids = userSnap.data()?.friends || [];
        if (friendUids.length === 0) { setFriendsLoading(false); return; }

        const snaps = await Promise.all(
          friendUids.map((uid) => getDoc(doc(db, 'users', uid))),
        );
        if (cancelled) return;
        const profiles = snaps
          .filter((s) => s.exists())
          .map((s) => ({
            uid: s.id,
            displayName: s.data()?.displayName || s.data()?.name || 'Unknown',
            photoURL: s.data()?.photoURL || null,
          }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        setFriendsList(profiles);
      } catch (err) {
        if (__DEV__) console.error('Failed to fetch friends:', err);
      } finally {
        if (!cancelled) setFriendsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [currentUid]);

  const toggleTagPlayer = useCallback((tagTarget) => {
    setTaggedPlayers((prev) => {
      const isAlreadyTagged = prev.some((p) => p.uid === tagTarget.uid);
      if (isAlreadyTagged) return prev.filter((p) => p.uid !== tagTarget.uid);
      if (prev.length >= MAX_TAGGED_PLAYERS) return prev;
      return [...prev, tagTarget];
    });
  }, []);

  // ── Playback progress (0-1, updated on every status tick) ─────────────────
  // Represents position within the active preview range:
  //   • trim mode  → fraction through [trimStart, trimEnd]
  //   • short clip → fraction through the full video duration
  const [playbackProgress, setPlaybackProgress] = useState(0);

  // ── Double-upload guard ────────────────────────────────────────────────────
  // Set to true the moment handlePostClip begins; cleared only on error so the
  // user can retry. Never cleared on success — navigation takes the user away.
  const postingRef = useRef(false);

  // ── Player event listeners ───────────────────────────────────────────────
  // sourceLoad fires when the player has loaded video metadata (duration, etc.)
  useEffect(() => {
    const loadSub = player.addListener('sourceLoad', ({ duration }) => {
      if (duration > 0 && !videoReady) {
        videoDurationRef.current = duration;
        setVideoDuration(duration);

        const initEnd = Math.min(MAX_CLIP_DURATION_SEC, duration);
        trimStartRef.current = 0;
        trimEndRef.current   = initEnd;
        setTrimStart(0);
        setTrimEnd(initEnd);

        setVideoReady(true);
      }
    });

    const playingSub = player.addListener('playingChange', ({ isPlaying: playing }) => {
      setIsPlaying(playing);
    });

    // Periodic time updates — progress bar + trim-range looping
    const timeSub = player.addListener('timeUpdate', ({ currentTime }) => {
      const dur = videoDurationRef.current;

      // Update playback progress bar
      if (dur > MAX_CLIP_DURATION_SEC) {
        const rangeDur = trimEndRef.current - trimStartRef.current;
        const progress = rangeDur > 0
          ? Math.max(0, Math.min(1, (currentTime - trimStartRef.current) / rangeDur))
          : 0;
        setPlaybackProgress(progress);
      } else if (dur > 0) {
        setPlaybackProgress(Math.max(0, Math.min(1, currentTime / dur)));
      }

      // Loop within the selected trim range while previewing
      if (
        dur > MAX_CLIP_DURATION_SEC &&
        player.playing &&
        currentTime >= trimEndRef.current - 0.05
      ) {
        player.currentTime = trimStartRef.current;
      }
    });

    return () => {
      loadSub.remove();
      playingSub.remove();
      timeSub.remove();
    };
  }, [player, videoReady]);

  // ── Toggle play / pause ───────────────────────────────────────────────────
  const togglePlayPause = useCallback(() => {
    if (!videoReady) return;
    try {
      if (player.playing) {
        player.pause();
      } else {
        // If near the end, restart from trim start
        const dur = videoDurationRef.current;
        if (dur > 0 && player.currentTime >= dur - 0.1) {
          player.currentTime = trimStartRef.current;
        }
        player.play();
      }
    } catch {
      // Non-fatal — ignore teardown races on unmount
    }
  }, [player, videoReady]);

  // ── PanResponder — left (start) handle ───────────────────────────────────
  // Reads trimStartRef / trimEndRef / barWidthRef / videoDurationRef to avoid
  // stale closures; updates both ref (for subsequent handler reads) and state
  // (to trigger re-render of the trim bar).
  const leftGrant  = useRef({ x: 0, start: 0 });
  const leftPan    = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (_, g) => {
        leftGrant.current = { x: g.x0, start: trimStartRef.current };
      },

      onPanResponderMove: (_, g) => {
        if (barWidthRef.current <= 0 || videoDurationRef.current <= 0) return;
        const secPerPx = videoDurationRef.current / barWidthRef.current;
        const raw      = leftGrant.current.start + (g.moveX - leftGrant.current.x) * secPerPx;
        // Clamp: max(0, trimEnd-10s) ≤ newStart ≤ trimEnd - 0.5s
        // The lower bound of (trimEnd - MAX_CLIP_DURATION_SEC) is the missing constraint
        // that prevented the left handle from expanding the selection past 10 seconds.
        const minStart = Math.max(0, trimEndRef.current - MAX_CLIP_DURATION_SEC);
        const newStart = Math.max(minStart, Math.min(raw, trimEndRef.current - 0.5));
        trimStartRef.current = newStart;
        setTrimStart(newStart);
      },

      onPanResponderRelease: () => {
        // Seek video to new trim start for immediate feedback
        try { player.currentTime = trimStartRef.current; } catch { /* ignore */ }
      },
    })
  ).current;

  // ── PanResponder — right (end) handle ────────────────────────────────────
  const rightGrant = useRef({ x: 0, end: 0 });
  const rightPan   = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (_, g) => {
        rightGrant.current = { x: g.x0, end: trimEndRef.current };
      },

      onPanResponderMove: (_, g) => {
        if (barWidthRef.current <= 0 || videoDurationRef.current <= 0) return;
        const secPerPx = videoDurationRef.current / barWidthRef.current;
        const raw      = rightGrant.current.end + (g.moveX - rightGrant.current.x) * secPerPx;
        // Clamp: trimStart + 0.5s ≤ newEnd ≤ min(trimStart + 10s, duration)
        const maxEnd   = Math.min(
          trimStartRef.current + MAX_CLIP_DURATION_SEC,
          videoDurationRef.current,
        );
        const newEnd   = Math.max(trimStartRef.current + 0.5, Math.min(raw, maxEnd));
        trimEndRef.current = newEnd;
        setTrimEnd(newEnd);
      },

      onPanResponderRelease: () => {
        try { player.currentTime = trimStartRef.current; } catch { /* ignore */ }
      },
    })
  ).current;

  // ── PanResponder — center (slide-window) region ───────────────────────────
  // Drags BOTH start and end together, preserving the current selected duration.
  // This lets the user slide the fixed-size window across the timeline.
  const centerGrant = useRef({ x: 0, start: 0, duration: 0 });
  const centerPan   = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,

      onPanResponderGrant: (_, g) => {
        // Snapshot start position and current duration at drag start.
        // Duration is held fixed for the entire drag so the window width never changes.
        centerGrant.current = {
          x:        g.x0,
          start:    trimStartRef.current,
          duration: trimEndRef.current - trimStartRef.current,
        };
      },

      onPanResponderMove: (_, g) => {
        if (barWidthRef.current <= 0 || videoDurationRef.current <= 0) return;
        const { start, duration } = centerGrant.current;
        const secPerPx = videoDurationRef.current / barWidthRef.current;
        const rawStart = start + (g.moveX - centerGrant.current.x) * secPerPx;
        // Clamp so the whole window stays inside [0, videoDuration]
        const newStart = Math.max(0, Math.min(rawStart, videoDurationRef.current - duration));
        const newEnd   = newStart + duration;
        trimStartRef.current = newStart;
        trimEndRef.current   = newEnd;
        setTrimStart(newStart);
        setTrimEnd(newEnd);
      },

      onPanResponderRelease: () => {
        try { player.currentTime = trimStartRef.current; } catch { /* ignore */ }
      },
    })
  ).current;

  // ── Button label driven by upload/processing state ────────────────────────
  const buttonLabel = () => {
    if (uploadState === TRIMMING)   return 'Trimming clip…';
    if (uploadState === CREATING)   return 'Preparing…';
    if (uploadState === UPLOADING)  return 'Uploading…';
    if (uploadState === FINALIZING) return 'Finishing up…';
    return 'Post Clip';
  };

  // ── Primary post action ───────────────────────────────────────────────────
  // Order of operations:
  //   1. Validate local params
  //   2. Trim locally (if source > MAX_CLIP_DURATION_SEC)
  //   3. createClipSession (reserves backend slot)
  //   4a. Upload trimmed/original file to Firebase Storage
  //   4b. finalizeClipUpload
  //   5. Navigate back to RunDetails
  const handlePostClip = async () => {
    // ── Double-upload guard ────────────────────────────────────────────────
    // Catches rapid double-taps that fire before React re-renders the disabled
    // state.  postingRef is never reset on the success path; navigation handles
    // the screen exit.
    if (postingRef.current) return;
    postingRef.current = true;

    if (__DEV__) console.log('[clips] ── handlePostClip called ──────────────────────────');
    if (__DEV__) console.log('[clips] sourceVideoUri   :', sourceVideoUri);
    if (__DEV__) console.log('[clips] gymId            :', gymId);
    if (__DEV__) console.log('[clips] presenceId       :', presenceId);
    if (__DEV__) console.log('[clips] videoDuration    :', videoDurationRef.current.toFixed(2), 's');
    if (__DEV__) console.log('[clips] needsTrim        :', needsTrim);
    if (needsTrim) {
      if (__DEV__) console.log('[clips] trimStart        :', trimStartRef.current.toFixed(2), 's');
      if (__DEV__) console.log('[clips] trimEnd          :', trimEndRef.current.toFixed(2), 's');
    }

    // ── 1. Validate local params before hitting the network ─────────────────
    if (!sourceVideoUri) {
      if (__DEV__) console.warn('[clips] VALIDATION FAILED sourceVideoUri is missing');
      postingRef.current = false;
      Alert.alert('Missing video', 'No video found. Please go back and try again.');
      return;
    }
    if (!gymId || typeof gymId !== 'string' || gymId.trim() === '') {
      if (__DEV__) console.warn('[clips] VALIDATION FAILED gymId is missing or empty:', gymId);
      postingRef.current = false;
      Alert.alert('Missing gym', 'Gym ID is missing. Please go back and try again.');
      return;
    }

    // ── 2. Trim locally (only when source exceeds clip limit) ────────────────
    // trimVideo() writes a new MP4 to the device cache; the original is untouched.
    // If no trim is needed we upload the original directly.
    let uploadUri    = sourceVideoUri;
    let durationSec  = videoDurationRef.current > 0 ? videoDurationRef.current : null;

    if (needsTrim) {
      const start = trimStartRef.current;
      const end   = trimEndRef.current;
      setUploadState(TRIMMING);
      try {
        if (__DEV__) console.log('[clips] trimVideo start:', start.toFixed(2), '| end:', end.toFixed(2));
        uploadUri   = await trimVideo(sourceVideoUri, start, end);
        durationSec = end - start;
        if (__DEV__) console.log('[clips] trimVideo complete uri:', uploadUri, '| duration:', durationSec.toFixed(2), 's');
      } catch (trimErr) {
        if (__DEV__) console.error('[clips] TRIM ERROR', serializeError(trimErr));
        postingRef.current = false;
        setUploadState(IDLE);
        Alert.alert(
          'Trim failed',
          trimErr?.message ?? 'Could not trim the video. Please try again.',
        );
        return;
      }
    }

    // ── 3. Create clip session (reserves the slot on the backend) ───────────
    // This is the authoritative gate for per-session limits and weekly caps.
    setUploadState(CREATING);

    let clipId, storagePath;
    try {
      if (__DEV__) console.log('[clips] createClipSession gymId:', gymId, '| presenceId:', presenceId);
      const fn  = httpsCallable(getFunctions(undefined, FUNCTIONS_REGION), 'createClipSession');
      const res = await fn({ gymId, presenceId });
      if (__DEV__) console.log('[clips] createClipSession', JSON.stringify(res?.data, null, 2));

      clipId      = res.data?.clipId;
      storagePath = res.data?.storagePath;

      if (!clipId || !storagePath) {
        throw new Error('Session response is missing clipId or storagePath.');
      }
    } catch (sessionErr) {
      if (__DEV__) console.error('[clips] CREATE SESSION ERROR', serializeError(sessionErr));
      postingRef.current = false;
      setUploadState(IDLE);
      Alert.alert(
        'Could not start clip',
        sessionErr?.message ?? 'Something went wrong. Please try again.',
      );
      return;
    }

    if (__DEV__) console.log('[clips] clipId           :', clipId);
    if (__DEV__) console.log('[clips] storagePath      :', storagePath);

    // ── 4a. Upload to Firebase Storage ──────────────────────────────────────
    setUploadState(UPLOADING);
    setUploadProgress(0);

    try {
      const storage = getStorage();
      if (__DEV__) console.log('[clips] upload started storagePath:', storagePath, '| uri:', uploadUri);

      const fileRef  = ref(storage, storagePath);
      const response = await fetch(uploadUri);
      if (__DEV__) console.log('[clips] fetch status:', response.status, response.ok ? 'OK' : 'NOT OK');
      const blob = await response.blob();
      if (__DEV__) console.log('[clips] blob size (bytes):', blob.size, '| type:', blob.type);

      // uploadBytesResumable exposes progress events; wrap in a Promise so the
      // rest of the async flow (finalize → navigate) stays linear.
      await new Promise((resolve, reject) => {
        const task = uploadBytesResumable(fileRef, blob, { contentType: 'video/mp4' });
        task.on(
          'state_changed',
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            setUploadProgress(pct);
          },
          (err) => reject(err),
          () => resolve(),
        );
      });
      if (__DEV__) console.log('[clips] upload complete');
    } catch (uploadErr) {
      if (__DEV__) console.error('[clips] UPLOAD ERROR', serializeError(uploadErr));
      postingRef.current = false;
      setUploadState(IDLE);
      Alert.alert(
        'Upload failed',
        uploadErr?.message ?? 'Something went wrong during upload. Please try again.',
      );
      return;
    }

    // ── 4b. Finalize via Cloud Function ─────────────────────────────────────
    setUploadState(FINALIZING);

    try {
      const functions    = getFunctions(undefined, FUNCTIONS_REGION);
      const finalizeClip = httpsCallable(functions, 'finalizeClipUpload');
      if (__DEV__) console.log('[clips] finalize clipId:', clipId, '| durationSec:', durationSec);

      const result = await finalizeClip({
        clipId,
        gymId,
        durationSec,
        caption: caption.trim() || null,
        category: category || null,
        taggedPlayers: taggedPlayers.length > 0 ? taggedPlayers : null,
      });
      if (__DEV__) console.log('[clips] finalize', JSON.stringify(result?.data, null, 2));
    } catch (finalizeErr) {
      if (__DEV__) console.error('[clips] FINALIZE ERROR', serializeError(finalizeErr));
      postingRef.current = false;
      setUploadState(IDLE);
      Alert.alert(
        'Finalize failed',
        finalizeErr?.message ?? 'Clip was uploaded but could not be finalized. Please try again.',
      );
      return;
    }

    // ── 5. Full success ──────────────────────────────────────────────────────
    // Do NOT reset uploadState or postingRef here — navigation removes the
    // screen, so there is nothing to re-enable and no risk of a second tap.
    if (__DEV__) console.log('[clips] ── post clip complete ────────────────────────────');

    hapticSuccess();
    Alert.alert('Posted! 🎉', 'Your clip has been posted.', [
      {
        text: 'OK',
        onPress: () => {
          navigation.navigate('RunDetails', { gymId, scrollToClips: true });
        },
      },
    ]);
  };

  // ── Error state: no video URI ─────────────────────────────────────────────
  if (!sourceVideoUri) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color="#EF4444" style={{ marginBottom: 12 }} />
          <Text style={styles.errorText}>No video found. Please go back and try again.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived trim bar pixel values (only used when needsTrim && barWidth > 0)
  const startPx     = barWidth > 0 && videoDuration > 0
    ? (trimStart / videoDuration) * barWidth
    : 0;
  const endPx       = barWidth > 0 && videoDuration > 0
    ? (trimEnd   / videoDuration) * barWidth
    : barWidth;
  // Width of the transparent center drag target that sits between the two handles.
  // Hidden when the selection is too narrow to fit (e.g. user shortened below 2× HANDLE_W).
  const centerWidth = Math.max(0, endPx - startPx - HANDLE_W);

  // Width of the unselected region to the right of the selection window.
  const dimRightWidth = Math.max(0, barWidth - endPx);

  // ── Filtered friends list (driven by tag search query) ────────────────────
  const filteredFriends = tagSearchQuery.trim()
    ? friendsList.filter((f) =>
        f.displayName.toLowerCase().includes(tagSearchQuery.toLowerCase())
      )
    : friendsList;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Full-screen video preview ── */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />

      {/* ── Tap overlay to toggle play/pause ── */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={togglePlayPause}
      />

      {/* ── Play icon shown when paused ── */}
      {!isPlaying && videoReady && (
        <View style={styles.pausedIndicator} pointerEvents="none">
          <View style={styles.playBadge}>
            <Ionicons name="play-circle" size={72} color="#fff" />
          </View>
        </View>
      )}

      {/* ── Header + bottom panel ──
           KeyboardAvoidingView sits between the absoluteFill video layer and the
           overlay so that when the caption keyboard opens the bottom panel is
           pushed up rather than hidden behind it. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        pointerEvents="box-none"
      >
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">

        {/* Header: [back] [gym name / Preview] [retake] */}
        <View style={styles.header} pointerEvents="auto">
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            disabled={isLoading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="chevron-back"
              size={26}
              color={isLoading ? 'rgba(255,255,255,0.3)' : '#fff'}
            />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {gymName ? (
              <Text style={styles.gymNameText} numberOfLines={1}>{gymName}</Text>
            ) : null}
            <Text style={styles.previewLabel}>
              {needsTrim ? 'Trim your clip' : 'Ready to post'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            disabled={isLoading}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="refresh-outline"
              size={24}
              color={isLoading ? 'rgba(255,255,255,0.3)' : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {/* Bottom panel: trim bar (if needed) + Post Clip button */}
        <View style={styles.bottomPanel} pointerEvents="auto">

          {/* ── Playback progress — thin scrubber at the top of the panel.
               Hidden during upload states (upload progress bar takes over). ── */}
          {videoReady && !isLoading && (
            <View style={styles.playbackBarTrack}>
              <View style={[styles.playbackBarFill, { width: `${playbackProgress * 100}%` }]} />
            </View>
          )}

          {/* ── Trim bar — only shown when source video > 10 seconds ── */}
          {needsTrim && (
            <View style={styles.trimWrapper}>
              <Text style={styles.trimHint}>
                Drag center to move · Drag edges to resize
              </Text>

              {/* Track + handles */}
              <View
                style={styles.trackOuter}
                onLayout={e => {
                  const w = e.nativeEvent.layout.width;
                  barWidthRef.current = w;
                  setBarWidth(w);
                }}
              >
                {/* Gray background track */}
                <View style={styles.trackBg} />

                {barWidth > 0 && (
                  <>
                    {/* Dim overlay — left of selection */}
                    {startPx > 0 && (
                      <View
                        style={[styles.dimOverlay, { left: 0, width: startPx }]}
                        pointerEvents="none"
                      />
                    )}

                    {/* Dim overlay — right of selection */}
                    {dimRightWidth > 0 && (
                      <View
                        style={[styles.dimOverlay, { left: endPx, width: dimRightWidth }]}
                        pointerEvents="none"
                      />
                    )}

                    {/* Orange selection region (visual only — touches pass through) */}
                    <View
                      style={[styles.selection, {
                        left:  startPx,
                        width: Math.max(HANDLE_W * 2, endPx - startPx),
                      }]}
                      pointerEvents="none"
                    />

                    {/* Center drag region — slides the whole window as one unit.
                        Transparent; sits above the selection but below the handles
                        so edge-handle touches always take priority. */}
                    {centerWidth >= 8 && (
                      <View
                        style={[styles.centerRegion, {
                          left:  startPx + HANDLE_W / 2,
                          width: centerWidth,
                        }]}
                        {...centerPan.panHandlers}
                      />
                    )}

                    {/* Left (start) handle */}
                    <View
                      style={[styles.handle, { left: startPx - HANDLE_W / 2 }]}
                      {...leftPan.panHandlers}
                    >
                      <View style={styles.handleGrip} />
                    </View>

                    {/* Right (end) handle */}
                    <View
                      style={[styles.handle, { left: endPx - HANDLE_W / 2 }]}
                      {...rightPan.panHandlers}
                    >
                      <View style={styles.handleGrip} />
                    </View>
                  </>
                )}
              </View>

              {/* Time labels */}
              <View style={styles.timeRow}>
                <Text style={styles.timeLabel}>{formatSec(trimStart)}</Text>
                <Text style={styles.durationLabel}>
                  {(trimEnd - trimStart).toFixed(1)}s selected
                </Text>
                <Text style={styles.timeLabel}>{formatSec(trimEnd)}</Text>
              </View>
            </View>
          )}

          {/* ── Upload progress bar — visible only while uploading ── */}
          {uploadState === UPLOADING && (
            <View style={styles.progressWrapper}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{uploadProgress}%</Text>
            </View>
          )}

          {/* ── Caption + category ── */}
          {!isLoading && (
            <View style={styles.metadataSection}>
              <TextInput
                style={styles.captionInput}
                placeholder="Add a caption…"
                placeholderTextColor="rgba(255,255,255,0.35)"
                value={caption}
                onChangeText={setCaption}
                maxLength={MAX_CAPTION_LENGTH}
                returnKeyType="done"
                blurOnSubmit
              />
              <View style={styles.categoryRow}>
                {CLIP_CATEGORIES.map((cat) => {
                  const isSelected = category === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                      activeOpacity={0.7}
                      onPress={() => setCategory(isSelected ? null : cat.key)}
                    >
                      <Text style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* ── Tag players ── */}
              <TouchableOpacity
                style={styles.tagToggle}
                activeOpacity={0.7}
                onPress={() => {
                  const opening = !showTagPicker;
                  setShowTagPicker(opening);
                  if (!opening) setTagSearchQuery(''); // clear search on close
                }}
              >
                <Ionicons name="people-outline" size={16} color="rgba(255,255,255,0.6)" />
                <Text style={styles.tagToggleText}>
                  {taggedPlayers.length > 0
                    ? `Tagged: ${taggedPlayers.map((p) => p.displayName).join(', ')}`
                    : '+ Tag players'}
                </Text>
                {taggedPlayers.length > 0 && (
                  <Text style={styles.tagCount}>{taggedPlayers.length}/{MAX_TAGGED_PLAYERS}</Text>
                )}
                <Ionicons
                  name={showTagPicker ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="rgba(255,255,255,0.4)"
                  style={{ marginLeft: 'auto' }}
                />
              </TouchableOpacity>

              {showTagPicker && (
                <View style={styles.tagPickerContainer}>
                  {/* Search input */}
                  <TextInput
                    style={styles.tagSearchInput}
                    placeholder="Search players…"
                    placeholderTextColor="rgba(255,255,255,0.30)"
                    value={tagSearchQuery}
                    onChangeText={setTagSearchQuery}
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                  />

                  {friendsLoading ? (
                    <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ paddingVertical: 8 }} />
                  ) : filteredFriends.length === 0 ? (
                    <Text style={styles.tagEmptyText}>
                      {tagSearchQuery ? 'No players found' : 'No friends to tag yet'}
                    </Text>
                  ) : (
                    <ScrollView
                      style={styles.tagPickerList}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                    >
                      {filteredFriends.map((friend) => {
                        const isSelected = taggedPlayers.some((p) => p.uid === friend.uid);
                        const atMax = taggedPlayers.length >= MAX_TAGGED_PLAYERS && !isSelected;
                        const initial = friend.displayName?.[0]?.toUpperCase() || '?';
                        return (
                          <TouchableOpacity
                            key={friend.uid}
                            style={[styles.tagPlayerRow, atMax && styles.tagRowDisabled]}
                            activeOpacity={atMax ? 1 : 0.7}
                            onPress={() => !atMax && toggleTagPlayer(friend)}
                          >
                            {/* Avatar */}
                            {friend.photoURL ? (
                              <Image source={{ uri: friend.photoURL }} style={styles.tagAvatar} />
                            ) : (
                              <View style={[styles.tagAvatar, styles.tagAvatarFallback]}>
                                <Text style={styles.tagAvatarInitial}>{initial}</Text>
                              </View>
                            )}
                            <Text style={[
                              styles.tagPlayerName,
                              isSelected && styles.tagPlayerNameSelected,
                              atMax && styles.tagPlayerNameDisabled,
                            ]} numberOfLines={1}>
                              {friend.displayName}
                            </Text>
                            {isSelected
                              ? <Ionicons name="checkmark-circle" size={18} color="#FF7A45" />
                              : !atMax && <Ionicons name="add-circle-outline" size={18} color="rgba(255,255,255,0.3)" />
                            }
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Post Clip button */}
          <TouchableOpacity
            style={[styles.postBtn, isLoading && styles.postBtnDisabled]}
            onPress={handlePostClip}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading && (
              <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.postBtnText}>{buttonLabel()}</Text>
          </TouchableOpacity>

        </View>
      </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 20,
  },
  backBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },

  pausedIndicator: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Dark circle behind the play icon so it reads clearly on any video frame.
  playBadge: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 44,
    padding: 4,
  },

  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  gymNameText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 2,
  },
  previewLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Bottom panel ──
  bottomPanel: {
    backgroundColor: 'rgba(0,0,0,0.60)',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  // ── Trim bar ──
  trimWrapper: {
    marginBottom: 18,
  },
  trimHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  trackOuter: {
    height: 44,            // tall enough for comfortable touch targets
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    height: 32,            // taller base so dim overlays have visual weight
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  // Shade applied over the unselected portion of the trim rail.
  // pointerEvents="none" — never intercepts touches.
  dimOverlay: {
    position: 'absolute',
    top: 6,                // (44 - 32) / 2 = 6 — aligns with the selection height
    height: 32,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  selection: {
    position: 'absolute',
    top: 6,                // (44 - 32) / 2 = 6 — vertically centres the 32-px region
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255,122,69,0.35)',
    borderWidth: 2,
    borderColor: '#FF7A45',
  },
  handle: {
    position: 'absolute',
    width: HANDLE_W,
    height: 44,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FF7A45',
    borderRadius: 5,
  },
  handleGrip: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 1,
  },
  // Transparent touch target that covers the area between the two handles.
  // Receives drag gestures to slide the entire selection window.
  centerRegion: {
    position: 'absolute',
    top: 0,
    height: 44,
    // No background — the orange selection region is visible beneath it.
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  timeLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
  },
  durationLabel: {
    color: '#FF7A45',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Playback progress ──
  playbackBarTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: 14,
    overflow: 'hidden',
  },
  playbackBarFill: {
    height: '100%',
    backgroundColor: '#FF7A45',
    borderRadius: 1,
  },

  // ── Upload progress ──
  progressWrapper: {
    marginBottom: 12,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#FF7A45',
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 5,
  },

  // ── Caption + category ──
  metadataSection: {
    marginBottom: 14,
  },
  captionInput: {
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 10,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  categoryChipSelected: {
    backgroundColor: 'rgba(255,122,69,0.2)',
    borderColor: '#FF7A45',
  },
  categoryChipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  categoryChipTextSelected: {
    color: '#FF7A45',
    fontWeight: '700',
  },

  // ── Tag players ──
  tagToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  tagToggleText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  tagCount: {
    color: '#FF7A45',
    fontSize: 11,
    fontWeight: '700',
  },
  tagPickerContainer: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  tagSearchInput: {
    color: '#fff',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tagPickerList: {
    maxHeight: 180,
  },
  tagEmptyText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 12,
  },
  tagPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tagRowDisabled: {
    opacity: 0.38,
  },
  tagAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#333',
  },
  tagAvatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,122,69,0.2)',
  },
  tagAvatarInitial: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF7A45',
  },
  tagPlayerName: {
    flex: 1,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
  },
  tagPlayerNameSelected: {
    color: '#FF7A45',
    fontWeight: '600',
  },
  tagPlayerNameDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },

  // ── Post button ──
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#FF7A45',
    shadowColor: '#FF7A45',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  postBtnDisabled: {
    backgroundColor: '#C2410C',
    shadowOpacity: 0.15,
  },
  postBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
