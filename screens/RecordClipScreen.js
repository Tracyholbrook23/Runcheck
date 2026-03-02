/**
 * RecordClipScreen.js — In-app clip recorder
 *
 * Handles the full in-app recording flow:
 *   1. Request camera + microphone permissions.
 *   2. Show a live camera preview with a Record / Stop button.
 *   3. Auto-stop after MAX_DURATION_SEC (10 s) if the user has not
 *      stopped manually.
 *   4. On completion navigate to TrimClipScreen with the recorded URI.
 *
 * Route params received from RunDetailsScreen:
 *   - clipSession  {object} — Reserved session from createClipSession
 *   - gymId        {string} — Firestore gym ID
 *
 * Does NOT perform any trimming — that is deferred to TrimClipScreen.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

const MAX_DURATION_SEC = 10;

export default function RecordClipScreen({ route, navigation }) {
  const { clipSession, gymId } = route.params ?? {};

  // ── Permissions ───────────────────────────────────────────────────────────
  const [cameraPermission, requestCameraPermission]   = useCameraPermissions();
  const [micPermission,    requestMicPermission]       = useMicrophonePermissions();

  // ── Recording state ───────────────────────────────────────────────────────
  const cameraRef            = useRef(null);
  const autoStopTimerRef     = useRef(null);
  const countdownIntervalRef = useRef(null);

  const [isRecording, setIsRecording]   = useState(false);
  const [countdown,   setCountdown]     = useState(MAX_DURATION_SEC);

  // Clean up timers on unmount so nothing fires after the component is gone
  useEffect(() => {
    return () => {
      clearTimeout(autoStopTimerRef.current);
      clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearTimers = () => {
    clearTimeout(autoStopTimerRef.current);
    clearInterval(countdownIntervalRef.current);
  };

  // ── Start recording ───────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording) return;

    setIsRecording(true);
    setCountdown(MAX_DURATION_SEC);

    // Tick the on-screen countdown every second
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Hard auto-stop: call stopRecording after MAX_DURATION_SEC.
    // stopRecording resolves the recordAsync promise, which handles
    // navigation below.
    autoStopTimerRef.current = setTimeout(() => {
      cameraRef.current?.stopRecording();
    }, MAX_DURATION_SEC * 1000);

    try {
      // recordAsync() resolves when recording ends (stop called OR maxDuration
      // reached at the OS level). We pass maxDuration as an extra safety net.
      const result = await cameraRef.current.recordAsync({
        maxDuration: MAX_DURATION_SEC,
      });

      clearTimers();
      setIsRecording(false);

      const recordedUri = result?.uri;
      if (!recordedUri) {
        Alert.alert('Error', 'Recording failed — no video was saved. Please try again.');
        return;
      }

      navigation.navigate('TrimClipScreen', {
        clipSession,
        sourceVideoUri: recordedUri,
        gymId,
      });
    } catch (err) {
      clearTimers();
      setIsRecording(false);
      // If the user navigated away mid-recording the error is expected; suppress it.
      if (err?.message?.includes('cancelled') || err?.message?.includes('unmounted')) return;
      console.warn('[RecordClip] recordAsync error:', err);
      Alert.alert('Error', 'Recording failed. Please try again.');
    }
  }, [isRecording, clipSession, gymId, navigation]);

  // ── Stop recording (manual) ───────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (!isRecording) return;
    clearTimers();
    // Calling stopRecording() resolves the recordAsync() promise in startRecording,
    // so setIsRecording(false) and navigation happen there — not here.
    cameraRef.current?.stopRecording();
  }, [isRecording]);

  // ── Request both permissions at once ─────────────────────────────────────
  const requestPermissions = async () => {
    if (!cameraPermission.granted) await requestCameraPermission();
    if (!micPermission.granted)    await requestMicPermission();
  };

  // ── Permission loading ────────────────────────────────────────────────────
  if (!cameraPermission || !micPermission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // ── Permission denied / not yet granted ──────────────────────────────────
  if (!cameraPermission.granted || !micPermission.granted) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <Ionicons name="videocam-outline" size={52} color="#6B7280" style={{ marginBottom: 16 }} />
        <Text style={styles.permissionTitle}>Camera & Microphone Access</Text>
        <Text style={styles.permissionBody}>
          Recording a clip requires access to your camera and microphone.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermissions}>
          <Text style={styles.primaryButtonText}>Grant Permissions</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Camera preview ────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        mode="video"
      />

      {/* ── Overlaid UI ── */}
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">

        {/* Header row: close button + recording badge */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
            disabled={isRecording}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="close"
              size={28}
              color={isRecording ? 'rgba(255,255,255,0.3)' : '#fff'}
            />
          </TouchableOpacity>

          {isRecording ? (
            <View style={styles.recordingBadge}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingBadgeText}>REC  {countdown}s</Text>
            </View>
          ) : (
            <Text style={styles.hintTop}>
              Max {MAX_DURATION_SEC} s
            </Text>
          )}

          {/* Spacer keeps badge visually centred */}
          <View style={{ width: 36 }} />
        </View>

        {/* Bottom controls */}
        <View style={styles.controls}>
          <Text style={styles.hintBottom}>
            {isRecording ? 'Tap to stop early' : 'Tap to start recording'}
          </Text>

          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.8}
          >
            {isRecording
              ? <View style={styles.stopIcon} />
              : <View style={styles.recordIcon} />
            }
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Full-screen states ────────────────────────────────────────────────────
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

  // ── Camera + overlay ──────────────────────────────────────────────────────
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
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
  },
  closeButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintTop: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    marginRight: 6,
  },
  recordingBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Bottom controls ───────────────────────────────────────────────────────
  controls: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  hintBottom: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginBottom: 18,
  },
  recordButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  recordButtonActive: {
    borderColor: '#EF4444',
  },
  // Red circle shown when idle (tap to start)
  recordIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EF4444',
  },
  // White square shown while recording (tap to stop)
  stopIcon: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
});
