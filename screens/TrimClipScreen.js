/**
 * TrimClipScreen.js — Upload + finalize flow (with enhanced debug logging)
 *
 * Receives the clip session created by RunDetailsScreen and the URI of the
 * video the user selected. Handles uploading the video to Firebase Storage
 * and finalizing the clip via a Cloud Function.
 *
 * Route params:
 *   - clipSession    {object}  — Response from the `createClipSession` callable
 *                                (contains clipId, scheduleId, storagePath, expiresAt)
 *   - sourceVideoUri {string} — Local file URI of the video chosen by the user
 *   - gymId          {string} — Firestore ID of the originating gym
 */

import React, { useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getStorage, ref, uploadBytes } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

// ─── Upload states ────────────────────────────────────────────────────────────
const IDLE       = 'idle';
const UPLOADING  = 'uploading';
const FINALIZING = 'finalizing';

// ─── Region used for all callable functions ───────────────────────────────────
const FUNCTIONS_REGION = 'us-central1';

// ─── Debug helper ─────────────────────────────────────────────────────────────
// Serialises an error object so every field (code, message, stack, serverResponse
// etc.) shows up in the Metro / device log instead of just "[object Object]".
function serializeError(err) {
  if (!err) return 'undefined error';
  try {
    return JSON.stringify(err, Object.getOwnPropertyNames(err), 2);
  } catch {
    return String(err);
  }
}

export default function TrimClipScreen({ route, navigation }) {
  const { clipSession, sourceVideoUri, gymId } = route.params ?? {};
  const [uploadState, setUploadState] = useState(IDLE);

  const isLoading = uploadState === UPLOADING || uploadState === FINALIZING;

  // ── Button label driven by state ──────────────────────────────────────────
  const buttonLabel = () => {
    if (uploadState === UPLOADING)  return 'Uploading…';
    if (uploadState === FINALIZING) return 'Finalizing…';
    return 'Post Clip';
  };

  // ── Primary action ────────────────────────────────────────────────────────
  const handlePostClip = async () => {
    // ── 0. Log every incoming param so we can spot undefined / null values ──
    console.log('[clips] ── handlePostClip called ──────────────────────────');
    console.log('[clips] clipSession      :', JSON.stringify(clipSession, null, 2));
    console.log('[clips] clipId           :', clipSession?.clipId);
    console.log('[clips] storagePath      :', clipSession?.storagePath);
    console.log('[clips] sourceVideoUri   :', sourceVideoUri);
    console.log('[clips] gymId            :', gymId);

    const clipId      = clipSession?.clipId;
    const storagePath = clipSession?.storagePath;

    // ── 1. Validate required params ─────────────────────────────────────────
    if (!clipId) {
      console.warn('[clips] VALIDATION FAILED — clipId is missing');
    }
    if (!storagePath) {
      console.warn('[clips] VALIDATION FAILED — storagePath is missing');
    }
    if (!sourceVideoUri) {
      console.warn('[clips] VALIDATION FAILED — sourceVideoUri is missing');
    }
    if (!gymId || typeof gymId !== 'string' || gymId.trim() === '') {
      console.warn('[clips] VALIDATION FAILED — gymId is missing or empty:', gymId);
    }

    if (!clipId || !storagePath || !sourceVideoUri) {
      Alert.alert(
        'Missing data',
        'Clip session or video URI is invalid. Please go back and try again.',
      );
      return;
    }

    // Guard: gymId must be a non-empty string — the function rejects without it.
    if (!gymId || typeof gymId !== 'string' || gymId.trim() === '') {
      Alert.alert(
        'Missing gym',
        'Gym ID is missing. Please go back and try again.',
      );
      return;
    }

    // ── 2a. Upload to Firebase Storage ──────────────────────────────────────
    setUploadState(UPLOADING);

    try {
      const storage = getStorage();

      // Log the Firebase project + bucket so we can confirm the right project
      // is being used.  The bucket URL is of the form
      //   gs://<projectId>.appspot.com   (or a custom bucket name)
      console.log('[clips] storage app name :', storage.app?.name);
      console.log('[clips] storage bucket   :', storage._bucket?.bucket ?? storage.app?.options?.storageBucket ?? '(unknown)');
      console.log('[clips] storage project  :', storage.app?.options?.projectId ?? '(unknown)');

      console.log('[clips] upload started — storagePath:', storagePath);

      const fileRef  = ref(storage, storagePath);
      console.log('[clips] storage ref fullPath :', fileRef.fullPath);

      console.log('[clips] fetching blob from sourceVideoUri…');
      const response = await fetch(sourceVideoUri);
      console.log('[clips] fetch response status :', response.status, response.ok ? 'OK' : 'NOT OK');
      const blob = await response.blob();
      console.log('[clips] blob size (bytes) :', blob.size, '| type :', blob.type);

      await uploadBytes(fileRef, blob, { contentType: 'video/mp4' });
      console.log('[clips] upload success ✓');
    } catch (uploadErr) {
      console.error('[clips] UPLOAD ERROR ✗');
      console.error('[clips] upload error serialized :', serializeError(uploadErr));
      setUploadState(IDLE);
      Alert.alert(
        'Upload failed',
        uploadErr?.message ?? 'Something went wrong during upload. Please try again.',
      );
      return; // stop here — do not attempt finalize
    }

    // ── 2b. Finalize via Cloud Function ─────────────────────────────────────
    setUploadState(FINALIZING);

    try {
      const functions = getFunctions(undefined, FUNCTIONS_REGION);
      console.log('[clips] functions region :', FUNCTIONS_REGION);
      console.log('[clips] functions app    :', functions.app?.name);
      console.log('[clips] functions project:', functions.app?.options?.projectId ?? '(unknown)');

      // TODO: derive durationSec from the actual video once trimming is added.
      const durationSec = null;
      console.log('[clips] finalize started — clipId:', clipId, '| gymId:', gymId, '| durationSec:', durationSec);

      const finalizeClip = httpsCallable(functions, 'finalizeClipUpload');
      const result       = await finalizeClip({ clipId, gymId, durationSec });

      console.log('[clips] finalize success ✓ — response data:', JSON.stringify(result?.data, null, 2));
    } catch (finalizeErr) {
      console.error('[clips] FINALIZE ERROR ✗');
      console.error('[clips] finalize error serialized :', serializeError(finalizeErr));
      setUploadState(IDLE);
      Alert.alert(
        'Finalize failed',
        finalizeErr?.message ?? 'Clip was uploaded but could not be finalized. Please try again.',
      );
      return; // stop here — do not show "Posted"
    }

    // ── 3. Full success ──────────────────────────────────────────────────────
    console.log('[clips] ── post clip complete ✓ ────────────────────────────');
    setUploadState(IDLE);
    Alert.alert('Posted', 'Your clip has been posted!', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Custom header row */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={isLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color={isLoading ? '#D1D5DB' : '#111'} />
        </TouchableOpacity>
        <Text style={styles.title}>Trim Clip</Text>
        {/* Spacer keeps the title visually centred */}
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <Ionicons name="videocam-outline" size={48} color="#6B7280" style={styles.icon} />

        <Text style={styles.label}>Clip session ready</Text>

        <View style={styles.infoCard}>
          <Row label="Gym ID"  value={gymId ?? '—'} />
          <Row label="Clip ID" value={clipSession?.clipId ?? '—'} />
          <Row label="Video"   value={sourceVideoUri ? '✓ selected' : '—'} />
        </View>

        {/* Post Clip button */}
        <TouchableOpacity
          style={[styles.postButton, isLoading && styles.postButtonDisabled]}
          onPress={handlePostClip}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading && (
            <Ionicons
              name="cloud-upload-outline"
              size={18}
              color="#fff"
              style={styles.buttonIcon}
            />
          )}
          <Text style={styles.postButtonText}>{buttonLabel()}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

/** Small helper to render a two-column info row. */
function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: 0.2,
  },
  // Mirrors the width of the back button so the title stays centred
  headerSpacer: {
    width: 36,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  icon: {
    marginBottom: 16,
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 20,
  },
  infoCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 32,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  rowLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginRight: 8,
  },
  rowValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '400',
    flex: 1,
    textAlign: 'right',
  },
  // ── Post button ────────────────────────────────────────────────────────────
  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  postButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  buttonIcon: {
    marginRight: 8,
  },
  postButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
});
