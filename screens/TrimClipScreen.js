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

import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  PanResponder,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { trimVideo } from 'video-trimmer';

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
  const videoRef              = useRef(null);
  const [isPlaying,  setIsPlaying]  = useState(true);
  const [videoReady, setVideoReady] = useState(false);

  // ── Video duration (populated once the AV player loads) ──────────────────
  const [videoDuration, setVideoDuration] = useState(0);
  const videoDurationRef                  = useRef(0);

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

  // ── Video status callback ─────────────────────────────────────────────────
  // Called periodically by expo-av; handles first-load setup and trim-range
  // looping when the source video is longer than MAX_CLIP_DURATION_SEC.
  const handlePlaybackStatus = useCallback((status) => {
    if (!status.isLoaded) return;

    // First successful load: capture duration and initialise trim range
    if (!videoReady && status.durationMillis) {
      const dur = status.durationMillis / 1000;
      videoDurationRef.current = dur;
      setVideoDuration(dur);

      // Default selection: first MAX_CLIP_DURATION_SEC (or full video if shorter)
      const initEnd = Math.min(MAX_CLIP_DURATION_SEC, dur);
      trimStartRef.current = 0;
      trimEndRef.current   = initEnd;
      setTrimStart(0);
      setTrimEnd(initEnd);

      setVideoReady(true);
    }

    setIsPlaying(status.isPlaying);

    // Loop within the selected trim range while previewing
    if (
      videoDurationRef.current > MAX_CLIP_DURATION_SEC &&
      status.isPlaying &&
      status.positionMillis != null &&
      status.positionMillis / 1000 >= trimEndRef.current - 0.05  // 50 ms lookahead
    ) {
      videoRef.current?.setPositionAsync(trimStartRef.current * 1000).catch(() => {});
    }
  }, [videoReady]);

  // ── Toggle play / pause ───────────────────────────────────────────────────
  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current || !videoReady) return;
    try {
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        if (status.didJustFinish || status.positionMillis >= (status.durationMillis - 100)) {
          await videoRef.current.setPositionAsync(trimStartRef.current * 1000);
        }
        await videoRef.current.playAsync();
      }
    } catch {
      // Non-fatal — ignore AV teardown races on unmount
    }
  }, [videoReady]);

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
        // Clamp: 0 ≤ newStart ≤ trimEnd - 0.5s (enforce minimum 0.5 s selection)
        const newStart = Math.max(0, Math.min(raw, trimEndRef.current - 0.5));
        trimStartRef.current = newStart;
        setTrimStart(newStart);
      },

      onPanResponderRelease: () => {
        // Seek video to new trim start for immediate feedback
        videoRef.current?.setPositionAsync(trimStartRef.current * 1000).catch(() => {});
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
        videoRef.current?.setPositionAsync(trimStartRef.current * 1000).catch(() => {});
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
        videoRef.current?.setPositionAsync(trimStartRef.current * 1000).catch(() => {});
      },
    })
  ).current;

  // ── Button label driven by upload/processing state ────────────────────────
  const buttonLabel = () => {
    if (uploadState === TRIMMING)   return 'Trimming…';
    if (uploadState === CREATING)   return 'Starting…';
    if (uploadState === UPLOADING)  return 'Uploading…';
    if (uploadState === FINALIZING) return 'Finalizing…';
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
    console.log('[clips] ── handlePostClip called ──────────────────────────');
    console.log('[clips] sourceVideoUri   :', sourceVideoUri);
    console.log('[clips] gymId            :', gymId);
    console.log('[clips] presenceId       :', presenceId);
    console.log('[clips] videoDuration    :', videoDurationRef.current.toFixed(2), 's');
    console.log('[clips] needsTrim        :', needsTrim);
    if (needsTrim) {
      console.log('[clips] trimStart        :', trimStartRef.current.toFixed(2), 's');
      console.log('[clips] trimEnd          :', trimEndRef.current.toFixed(2), 's');
    }

    // ── 1. Validate local params before hitting the network ─────────────────
    if (!sourceVideoUri) {
      console.warn('[clips] VALIDATION FAILED — sourceVideoUri is missing');
      Alert.alert('Missing video', 'No video found. Please go back and try again.');
      return;
    }
    if (!gymId || typeof gymId !== 'string' || gymId.trim() === '') {
      console.warn('[clips] VALIDATION FAILED — gymId is missing or empty:', gymId);
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
        console.log('[clips] trimVideo — start:', start.toFixed(2), '| end:', end.toFixed(2));
        uploadUri   = await trimVideo(sourceVideoUri, start, end);
        durationSec = end - start;
        console.log('[clips] trimVideo complete ✓ — uri:', uploadUri, '| duration:', durationSec.toFixed(2), 's');
      } catch (trimErr) {
        console.error('[clips] TRIM ERROR ✗ —', serializeError(trimErr));
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
      console.log('[clips] createClipSession — gymId:', gymId, '| presenceId:', presenceId);
      const fn  = httpsCallable(getFunctions(undefined, FUNCTIONS_REGION), 'createClipSession');
      const res = await fn({ gymId, presenceId });
      console.log('[clips] createClipSession ✓ —', JSON.stringify(res?.data, null, 2));

      clipId      = res.data?.clipId;
      storagePath = res.data?.storagePath;

      if (!clipId || !storagePath) {
        throw new Error('Session response is missing clipId or storagePath.');
      }
    } catch (sessionErr) {
      console.error('[clips] CREATE SESSION ERROR ✗ —', serializeError(sessionErr));
      setUploadState(IDLE);
      Alert.alert(
        'Could not start clip',
        sessionErr?.message ?? 'Something went wrong. Please try again.',
      );
      return;
    }

    console.log('[clips] clipId           :', clipId);
    console.log('[clips] storagePath      :', storagePath);

    // ── 4a. Upload to Firebase Storage ──────────────────────────────────────
    setUploadState(UPLOADING);

    try {
      const storage = getStorage();
      console.log('[clips] upload started — storagePath:', storagePath, '| uri:', uploadUri);

      const fileRef  = ref(storage, storagePath);
      const response = await fetch(uploadUri);
      console.log('[clips] fetch status:', response.status, response.ok ? 'OK' : 'NOT OK');
      const blob = await response.blob();
      console.log('[clips] blob size (bytes):', blob.size, '| type:', blob.type);

      await uploadBytes(fileRef, blob, { contentType: 'video/mp4' });
      console.log('[clips] upload ✓');
    } catch (uploadErr) {
      console.error('[clips] UPLOAD ERROR ✗ —', serializeError(uploadErr));
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
      console.log('[clips] finalize — clipId:', clipId, '| durationSec:', durationSec);

      const result = await finalizeClip({ clipId, gymId, durationSec });
      console.log('[clips] finalize ✓ —', JSON.stringify(result?.data, null, 2));
    } catch (finalizeErr) {
      console.error('[clips] FINALIZE ERROR ✗ —', serializeError(finalizeErr));
      setUploadState(IDLE);
      Alert.alert(
        'Finalize failed',
        finalizeErr?.message ?? 'Clip was uploaded but could not be finalized. Please try again.',
      );
      return;
    }

    // ── 5. Full success ──────────────────────────────────────────────────────
    console.log('[clips] ── post clip complete ✓ ────────────────────────────');
    setUploadState(IDLE);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Full-screen video preview ── */}
      <Video
        ref={videoRef}
        style={StyleSheet.absoluteFill}
        source={{ uri: sourceVideoUri }}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping={false}
        onPlaybackStatusUpdate={handlePlaybackStatus}
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
          <Ionicons name="play-circle" size={68} color="rgba(255,255,255,0.85)" />
        </View>
      )}

      {/* ── Header + bottom panel ── */}
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
            <Text style={styles.previewLabel}>Preview</Text>
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
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },

  // ── Trim bar ──
  trimWrapper: {
    marginBottom: 16,
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
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  selection: {
    position: 'absolute',
    top: 6,                // (44 - 32) / 2 = 6 — vertically centres the 32-px region
    height: 32,
    borderRadius: 6,
    backgroundColor: 'rgba(255,122,69,0.25)',
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
