/**
 * RecordClipScreen.js — Social-style in-app clip recorder
 *
 * Full-screen camera experience with:
 *   - Gym name displayed in the header
 *   - Back/X button to exit
 *   - Camera flip button (header right + bottom right)
 *   - Library shortcut (bottom left) — opens ImagePicker, validates, navigates to preview
 *   - Hold-to-record button with circular progress ring
 *   - Slide-to-zoom: drag finger up/down while holding record to zoom
 *   - Double-tap anywhere on the camera preview to flip
 *   - Elapsed timer and countdown while recording
 *   - Max record length: 30 seconds
 *
 * After recording (or library pick), navigates to TrimClipScreen (PreviewPost) instead
 * of the old trim-only screen. createClipSession is still called here, after a real
 * video exists, so backing out without recording never reserves a session slot.
 *
 * Route params received from RunDetailsScreen:
 *   - gymId        {string}       — Firestore gym ID
 *   - gymName      {string|null}  — Gym display name shown in header
 *   - presenceId   {string|null}  — Compound session key `{uid}_{gymId}` for
 *                                   per-session clip deduplication
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { hapticMedium } from '../utils/haptics';
import * as ImagePicker from 'expo-image-picker';

// Maximum recording duration for in-app capture
const MAX_DURATION_SEC = 30;

/** Formats seconds into M:SS display (e.g., 0:03, 0:27) */
const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Maximum clip length enforced on library uploads
const MAX_LIBRARY_DURATION_SEC = 30;

// ── Progress ring constants ──────────────────────────────────────────────────
const RING_SIZE = 96;            // Outer diameter of the progress ring
const RING_STROKE = 4;           // Ring stroke width
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ── Slide-to-zoom constants ──────────────────────────────────────────────────
// Dragging 200pt upward goes from 0 → 1 zoom
const ZOOM_SENSITIVITY = 200;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function RecordClipScreen({ route, navigation }) {
  const { gymId, presenceId, gymName } = route.params ?? {};

  // ── Permissions ───────────────────────────────────────────────────────────
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission]       = useMicrophonePermissions();

  // ── Camera facing state ───────────────────────────────────────────────────
  const [facing, setFacing] = useState('back'); // 'back' | 'front'

  // ── Recording state ───────────────────────────────────────────────────────
  const cameraRef            = useRef(null);
  const autoStopTimerRef     = useRef(null);
  const countdownIntervalRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec,  setElapsedSec]  = useState(0);
  const [zoom, setZoom]              = useState(0);

  // Guard against duplicate start/stop from rapid press events
  const recordingLockRef = useRef(false);
  // Track recording state in a ref so PanResponder callbacks read fresh value
  const isRecordingRef = useRef(false);

  // ── Recording pulse animation (pulsing REC dot) ─────────────────────────
  const recPulse = useRef(new Animated.Value(1)).current;

  // ── Progress ring animation ─────────────────────────────────────────────
  const ringProgress = useRef(new Animated.Value(0)).current;
  const ringAnimRef = useRef(null);

  // ── Slide-to-zoom refs ─────────────────────────────────────────────────
  const zoomAtDragStart = useRef(0);
  const zoomRef = useRef(0); // mirror of zoom state for PanResponder

  // ── Double-tap tracking ───────────────────────────────────────────────────
  const lastTapRef = useRef(0);

  // Keep zoomRef in sync
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Keep isRecordingRef in sync
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // Clean up timers on unmount so nothing fires after the component is gone
  useEffect(() => {
    return () => {
      clearTimeout(autoStopTimerRef.current);
      clearInterval(countdownIntervalRef.current);
      if (ringAnimRef.current) ringAnimRef.current.stop();
    };
  }, []);

  // Pulse the REC dot while recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(recPulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(recPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      recPulse.setValue(1);
    }
  }, [isRecording]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearTimers = () => {
    clearTimeout(autoStopTimerRef.current);
    clearInterval(countdownIntervalRef.current);
  };

  // ── Flip camera ───────────────────────────────────────────────────────────
  const flipCamera = useCallback(() => {
    if (isRecording) return;
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
    setZoom(0);
  }, [isRecording]);

  // ── Double-tap on camera preview → flip ──────────────────────────────────
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      flipCamera();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  }, [flipCamera]);

  // ── Navigate to PreviewPost after a video is ready ────────────────────────
  const goToPreviewPost = useCallback(
    (recordedUri) => {
      navigation.navigate('TrimClipScreen', {
        sourceVideoUri: recordedUri,
        gymId,
        gymName,
        presenceId,
      });
    },
    [navigation, gymId, gymName, presenceId],
  );

  // ── Start recording (called on press-in) ─────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording || recordingLockRef.current) return;
    recordingLockRef.current = true;

    hapticMedium();
    setIsRecording(true);
    setElapsedSec(0);

    // Start the progress ring animation (0 → 1 over MAX_DURATION_SEC)
    ringProgress.setValue(0);
    ringAnimRef.current = Animated.timing(ringProgress, {
      toValue: 1,
      duration: MAX_DURATION_SEC * 1000,
      useNativeDriver: false, // strokeDashoffset can't use native driver
    });
    ringAnimRef.current.start();

    // Tick elapsed time every second
    countdownIntervalRef.current = setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + 1;
        if (next >= MAX_DURATION_SEC) {
          clearInterval(countdownIntervalRef.current);
          return MAX_DURATION_SEC;
        }
        return next;
      });
    }, 1000);

    // Auto-stop after MAX_DURATION_SEC
    autoStopTimerRef.current = setTimeout(() => {
      cameraRef.current?.stopRecording();
    }, MAX_DURATION_SEC * 1000);

    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SEC,
      });

      clearTimers();
      if (ringAnimRef.current) ringAnimRef.current.stop();
      setIsRecording(false);
      recordingLockRef.current = false;

      const recordedUri = result?.uri;
      if (!recordedUri) {
        Alert.alert('Error', 'Recording failed — no video was saved. Please try again.');
        return;
      }

      goToPreviewPost(recordedUri);
    } catch (err) {
      clearTimers();
      if (ringAnimRef.current) ringAnimRef.current.stop();
      setIsRecording(false);
      recordingLockRef.current = false;
      if (err?.message?.includes('cancelled') || err?.message?.includes('unmounted')) return;
      if (__DEV__) console.warn('recordAsync error:', err);
      Alert.alert('Error', 'Recording failed. Please try again.');
    }
  }, [isRecording, gymId, presenceId, goToPreviewPost]);

  // ── Stop recording (called on press-out / release) ──────────────────────
  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    clearTimers();
    if (ringAnimRef.current) ringAnimRef.current.stop();
    cameraRef.current?.stopRecording();
  }, []);

  // ── PanResponder for record button (hold + slide-to-zoom) ────────────────
  // Uses refs to avoid stale closures in PanResponder callbacks.
  const recordPanRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: () => {
        // Capture zoom at drag start for delta calculation
        zoomAtDragStart.current = zoomRef.current;
      },

      onPanResponderMove: (_, gesture) => {
        if (!isRecordingRef.current) return;
        // Negative dy = finger moving up = zoom in
        const delta = -gesture.dy / ZOOM_SENSITIVITY;
        const newZoom = Math.min(1, Math.max(0, zoomAtDragStart.current + delta));
        setZoom(newZoom);
      },

      // Release is handled by the View's onTouchEnd → stopRecording
      onPanResponderRelease: () => {},
      onPanResponderTerminate: () => {},
    }),
  ).current;

  // ── Pick from library ─────────────────────────────────────────────────────
  const pickFromLibrary = useCallback(async () => {
    if (isRecording) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted' && status !== 'limited') {
      Alert.alert(
        'Permission required',
        'Please allow access to your photo library in Settings to post a clip.',
      );
      return;
    }

    let pickerResult;
    try {
      pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
      });
    } catch (err) {
      Alert.alert('Error', 'Could not open the video picker. Please try again.');
      return;
    }
    if (pickerResult.canceled) return;

    const asset = pickerResult.assets?.[0];
    if (!asset?.uri) return;

    if (asset.duration != null && asset.duration / 1000 > MAX_LIBRARY_DURATION_SEC) {
      Alert.alert(
        'Clip too long',
        `Please choose a video that is ${MAX_LIBRARY_DURATION_SEC} seconds or shorter.`,
      );
      return;
    }

    goToPreviewPost(asset.uri);
  }, [isRecording, gymId, presenceId, goToPreviewPost]);

  // ── Permissions: still loading ────────────────────────────────────────────
  if (!cameraPermission || !micPermission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // ── Permissions: denied / not yet granted ────────────────────────────────
  if (!cameraPermission.granted || !micPermission.granted) {
    const requestAll = async () => {
      if (!cameraPermission.granted) await requestCameraPermission();
      if (!micPermission.granted)    await requestMicPermission();
    };
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <Ionicons name="videocam-outline" size={52} color="#6B7280" style={{ marginBottom: 16 }} />
        <Text style={styles.permissionTitle}>Camera & Microphone Access</Text>
        <Text style={styles.permissionBody}>
          Recording a clip requires access to your camera and microphone.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestAll}>
          <Text style={styles.primaryButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Derived UI values ─────────────────────────────────────────────────────
  // Ring stroke dashoffset — animated from full circumference (0%) to 0 (100%)
  const strokeDashoffset = ringProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_CIRCUMFERENCE, 0],
  });

  return (
    <View style={styles.container}>
      {/* ── Full-screen camera (behind everything) ── */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode="video"
        zoom={zoom}
      />

      {/* ── SafeAreaView overlay — header, tap zone, controls ── */}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">

        {/* ── Header row: [X] [gym name + REC badge] [flip] ── */}
        <View style={styles.header} pointerEvents="auto">
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.goBack()}
            disabled={isRecording}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="close"
              size={28}
              color={isRecording ? 'rgba(255,255,255,0.25)' : '#fff'}
            />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {gymName ? (
              <Text style={styles.gymNameLabel} numberOfLines={1}>{gymName}</Text>
            ) : null}
            {isRecording && (
              <View style={styles.recBadge}>
                <Animated.View style={[styles.recDot, { opacity: recPulse }]} />
                <Text style={styles.recBadgeText}>{formatTime(elapsedSec)} / {formatTime(MAX_DURATION_SEC)}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={flipCamera}
            disabled={isRecording}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="camera-reverse-outline"
              size={26}
              color={isRecording ? 'rgba(255,255,255,0.25)' : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {/* ── Middle tap zone — double-tap to flip ── */}
        <TouchableOpacity
          style={styles.tapZone}
          activeOpacity={1}
          onPress={handleDoubleTap}
          pointerEvents="auto"
        >
          <View style={styles.tapZoneInner}>
            {isRecording ? (
              <View style={styles.elapsedTimerWrap} pointerEvents="none">
                <Text style={styles.elapsedTimer}>{formatTime(elapsedSec)}</Text>
              </View>
            ) : (
              <View style={styles.doubleTapHintWrap} pointerEvents="none">
                <Text style={styles.doubleTapHint}>Double-tap to flip</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* ── Bottom area: hint + controls ── */}
        <View style={styles.bottomArea} pointerEvents="auto">

          {/* Hint text */}
          <Text style={styles.hintText}>
            {isRecording
              ? 'Slide up to zoom · Release to stop'
              : 'Hold to record · Slide up to zoom'}
          </Text>

          {/* Controls row: [library] [record+ring] [flip] */}
          <View style={styles.controlsRow}>

            {/* Library shortcut */}
            <TouchableOpacity
              style={styles.sideBtn}
              onPress={pickFromLibrary}
              disabled={isRecording}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="images-outline"
                size={26}
                color={isRecording ? 'rgba(255,255,255,0.25)' : '#fff'}
              />
              <Text style={[
                styles.sideBtnLabel,
                isRecording && { color: 'rgba(255,255,255,0.25)' },
              ]}>
                Library
              </Text>
            </TouchableOpacity>

            {/* Record button with progress ring + slide-to-zoom */}
            <View
              style={styles.recordBtnWrap}
              onTouchStart={() => { if (!isRecording && !recordingLockRef.current) startRecording(); }}
              onTouchEnd={() => { stopRecording(); }}
              {...recordPanRef.panHandlers}
            >
              {/* SVG progress ring */}
              <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringOverlay}>
                {/* Background track */}
                <Circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RING_RADIUS}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={RING_STROKE}
                  fill="transparent"
                />
                {/* Animated progress arc */}
                {isRecording && (
                  <AnimatedCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    stroke="#EF4444"
                    strokeWidth={RING_STROKE}
                    fill="transparent"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    rotation="-90"
                    origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                  />
                )}
              </Svg>

              {/* Inner button (centered inside the ring) */}
              <View style={[styles.recordBtnInner, isRecording && styles.recordBtnInnerActive]}>
                {isRecording
                  ? <View style={styles.stopIcon} />
                  : <View style={styles.recordIcon} />
                }
              </View>
            </View>

            {/* Flip shortcut (bottom) */}
            <TouchableOpacity
              style={styles.sideBtn}
              onPress={flipCamera}
              disabled={isRecording}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name="camera-reverse-outline"
                size={26}
                color={isRecording ? 'rgba(255,255,255,0.25)' : '#fff'}
              />
              <Text style={[
                styles.sideBtnLabel,
                isRecording && { color: 'rgba(255,255,255,0.25)' },
              ]}>
                Flip
              </Text>
            </TouchableOpacity>

          </View>
        </View>
      </SafeAreaView>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // ── Permission screens ────────────────────────────────────────────────────
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  permissionScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#F9FAFB',
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  permissionBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 15,
  },

  // ── Camera container ──────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Overlay (sits above camera) ───────────────────────────────────────────
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
  },

  // ── Header row ────────────────────────────────────────────────────────────
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
  gymNameLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 4,
  },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 5,
  },
  recBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // ── Middle tap zone (double-tap to flip) ──────────────────────────────────
  tapZone: {
    flex: 1,
  },
  tapZoneInner: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 24,
  },
  elapsedTimerWrap: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  elapsedTimer: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  doubleTapHintWrap: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  doubleTapHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '500',
  },

  // ── Bottom area ───────────────────────────────────────────────────────────
  bottomArea: {
    paddingBottom: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
  },

  hintText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Controls row: library | record | flip
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 12,
  },
  sideBtn: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtnLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // Record button wrapper — holds the SVG ring + inner button
  recordBtnWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringOverlay: {
    position: 'absolute',
  },
  // Inner button circle (sits inside the ring)
  recordBtnInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  recordBtnInnerActive: {
    borderColor: 'rgba(255,255,255,0.4)',
  },
  // Red filled circle = idle (hold to start)
  recordIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EF4444',
  },
  // White rounded square = recording (release to stop)
  stopIcon: {
    width: 24,
    height: 24,
    borderRadius: 5,
    backgroundColor: '#fff',
  },

});
