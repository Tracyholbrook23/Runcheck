/**
 * RunChatScreen.js — Run Group Chat
 *
 * Real-time group chat for a specific run. Messages live in:
 *   runs/{runId}/messages/{messageId}
 *
 * Access rules (enforced in both UI and Firestore rules):
 *  - Participants only — users who have joined the run can read and send.
 *  - Non-participants cannot enter this screen (Chat button is hidden in
 *    RunDetailsScreen) and Firestore rules deny reads/writes.
 *  - If a user leaves the run while on this screen, `isParticipant` becomes
 *    false in real time (live `runParticipants` subscription via useGymRuns),
 *    the message subscription is torn down, messages are cleared, and a gated
 *    state is shown. No crash, no stale data.
 *
 * Participation source of truth:
 *    runParticipants/{runId}_{userId}  — deleted on leaveRun.
 *    exists() check is used in Firestore rules; joinedRunIds Set is used here.
 *
 * Route params:
 *   - runId    {string} — Firestore run document ID
 *   - gymId    {string} — Firestore gym document ID (needed for participation check)
 *   - gymName  {string} — Gym name shown in the header
 *
 * MVP scope (intentionally excluded):
 *   - Read receipts
 *   - Typing indicators
 *   - Message reactions
 *   - Media uploads
 *   - Pagination
 *   - Message deletion
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Image,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS } from '../constants/theme';
import { auth } from '../config/firebase';
import { useProfile } from '../hooks';
import { useGymRuns } from '../hooks/useGymRuns';
import { subscribeToRunMessages, sendRunMessage, markRunChatSeen, RUN_CHAT_EXPIRY_MS } from '../services/runChatService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * formatMessageTime — Short timestamp for a message bubble.
 * Shows time only (e.g. "2:35 PM"). Handles Firestore Timestamps and Dates.
 */
function formatMessageTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * getInitials — Extracts up to 2 initials from a display name.
 * Used as a fallback when no avatar URL is available.
 */
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * AvatarBubble — Small circular avatar for a message row.
 * Shows the image if available, otherwise shows initials on a colored background.
 */
function AvatarBubble({ uri, name, size = 32, colors }) {
  const [imgError, setImgError] = useState(false);

  if (uri && !imgError) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: FONT_WEIGHTS.bold }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

/**
 * MessageBubble — A single chat message row.
 *
 * Own messages (isOwn = true) are right-aligned with the primary color.
 * Other messages are left-aligned with sender name + avatar shown.
 */
function MessageBubble({ message, isOwn, colors }) {
  return (
    <View
      style={[
        chatStyles.messageRow,
        isOwn ? chatStyles.messageRowOwn : chatStyles.messageRowOther,
      ]}
    >
      {/* Avatar — only shown for other users' messages */}
      {!isOwn && (
        <View style={chatStyles.avatarWrapper}>
          <AvatarBubble
            uri={message.senderAvatar}
            name={message.senderName}
            size={30}
            colors={colors}
          />
        </View>
      )}

      <View style={[chatStyles.bubbleWrapper, isOwn && chatStyles.bubbleWrapperOwn]}>
        {/* Sender name — only shown for other users' messages */}
        {!isOwn && (
          <Text style={[chatStyles.senderName, { color: colors.textSecondary }]}>
            {message.senderName}
          </Text>
        )}

        <View
          style={[
            chatStyles.bubble,
            isOwn
              ? [chatStyles.bubbleOwn, { backgroundColor: colors.primary }]
              : [chatStyles.bubbleOther, { backgroundColor: colors.surface, borderColor: colors.border }],
          ]}
        >
          <Text
            style={[
              chatStyles.bubbleText,
              { color: isOwn ? '#FFFFFF' : colors.textPrimary },
            ]}
          >
            {message.text}
          </Text>
        </View>

        <Text style={[chatStyles.messageTime, { color: colors.textMuted }]}>
          {formatMessageTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function RunChatScreen({ route, navigation }) {
  const { runId, gymId, gymName, startTime } = route.params;
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // Current user identity
  const uid = auth.currentUser?.uid;
  const { profile } = useProfile();

  // Participation check.
  // `participantLoading` is true until useGymRuns has received its first
  // snapshot — during that window joinedRunIds is an empty Set, which looks
  // identical to "confirmed not a participant". We must not show the gated
  // state until we actually know whether the user is in the run.
  const { joinedRunIds, loading: participantLoading } = useGymRuns(gymId);
  const isParticipant = joinedRunIds.has(runId);

  // Messages state
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messagesError, setMessagesError] = useState(false);

  // ── Chat expiration ────────────────────────────────────────────────────────
  // The chat window closes RUN_CHAT_EXPIRY_MS after startTime.
  // After expiry: messages are still readable (history preserved) but the
  // input bar is hidden and new messages are blocked.
  //
  // startTime comes from route.params (set by MessagesScreen when navigating
  // here). It may be a Firestore Timestamp or a plain Date — handle both.
  // If startTime is absent (e.g., very old participant doc), treat as not expired.
  const isChatExpired = useMemo(() => {
    if (!startTime) return false;
    const startMs = startTime.toDate
      ? startTime.toDate().getTime()
      : new Date(startTime).getTime();
    return startMs + RUN_CHAT_EXPIRY_MS < Date.now();
  }, [startTime]);

  // Input state
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // FlatList ref for auto-scroll
  const flatListRef = useRef(null);

  // ── Subscribe to messages — gated on confirmed participation ──────────────
  //
  // The subscription opens ONLY when BOTH conditions are true:
  //   1. participantLoading is false  — participation check has resolved
  //   2. isParticipant is true        — user is confirmed in the run
  //
  // Including participantLoading in the guard AND in the deps array is the
  // critical fix. Without it, React Strict Mode (used by all Expo dev builds)
  // double-invokes effects and can open the subscription in the gap between
  // the two invocations before loading fully resolves. This caused the
  // "Missing or insufficient permissions" Firestore error for non-participants.
  //
  // When isParticipant flips false mid-session (user left the run), the effect
  // cleanup unsubscribes, messages are cleared, and the gated state renders.
  useEffect(() => {
    if (!runId || participantLoading || !isParticipant) {
      // Not yet confirmed as participant — clear any stale messages and wait.
      setMessages([]);
      setMessagesError(false);
      return;
    }

    setMessagesLoading(true);
    setMessagesError(false);

    const unsubscribe = subscribeToRunMessages(runId, (newMessages, error) => {
      if (error) {
        // Firestore denied the read — treat as access lost, not a crash.
        if (__DEV__) console.warn('[RunChatScreen] messages subscription denied:', error);
        setMessagesError(true);
        setMessagesLoading(false);
        return;
      }
      setMessages(newMessages);
      setMessagesLoading(false);
    });

    return unsubscribe;
  }, [runId, participantLoading, isParticipant]);

  // ── Mark chat as seen when user opens it ──────────────────────────────────
  // Clears the unread badge on HomeScreen. Fires as soon as participant status
  // is confirmed. Non-fatal if it fails (unread badge may stay until next open).
  useEffect(() => {
    if (!runId || !uid || !isParticipant) return;
    markRunChatSeen(runId, uid);
  }, [runId, uid, isParticipant]);

  // ── Auto-scroll to bottom on new messages ─────────────────────────────────
  const scrollToBottom = useCallback(() => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  useEffect(() => {
    // Small delay gives the FlatList time to lay out before scrolling
    const timer = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timer);
  }, [scrollToBottom]);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!inputText.trim() || sending || !isParticipant || !uid || isChatExpired) return;  // participation + expiry double-check

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      await sendRunMessage({
        runId,
        senderId: uid,
        senderName: profile?.name || 'Player',
        senderAvatar: profile?.photoURL || null,
        text: textToSend,
      });
    } catch (err) {
      if (__DEV__) console.error('[RunChatScreen] send error:', err);
      // Restore the text if sending failed
      setInputText(textToSend);
    } finally {
      setSending(false);
    }
  };

  // ── Render message item ────────────────────────────────────────────────────
  const renderMessage = useCallback(
    ({ item }) => (
      <MessageBubble
        message={item}
        isOwn={item.senderId === uid}
        colors={colors}
      />
    ),
    [uid, colors],
  );

  const keyExtractor = useCallback((item) => item.id, []);

  // ── Header title ───────────────────────────────────────────────────────────
  // Two-line header: "Run Chat" bold + "Gym Name · 7:00 PM" subtitle.
  // Subtitle only shows time if startTime is available.
  useEffect(() => {
    let subtitle = gymName || null;
    if (subtitle && startTime) {
      try {
        const date = startTime.toDate ? startTime.toDate() : new Date(startTime);
        const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        subtitle = `${subtitle} · ${timeStr}`;
      } catch {
        // startTime unreadable — just show gym name
      }
    }

    navigation.setOptions({
      headerTitle: () => (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: colors.textPrimary, fontSize: FONT_SIZES.body, fontWeight: FONT_WEIGHTS.bold }}>
            Run Chat
          </Text>
          {subtitle ? (
            <Text style={{ color: colors.textMuted, fontSize: FONT_SIZES.xs }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ),
    });
  }, [navigation, gymName, startTime, colors]);

  // ─── Render ────────────────────────────────────────────────────────────────
  // Render priority:
  //   1. participantLoading  — still resolving membership; show spinner.
  //   2. !isParticipant      — confirmed non-participant; show gated state.
  //   3. messagesError       — Firestore denied the read (defensive layer);
  //                            show gated state (not a crash).
  //   4. messagesLoading     — confirmed participant, waiting on first snapshot.
  //   5. Normal chat         — messages + input bar.
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['left', 'right']}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        {/* State 1: checking participation */}
        {participantLoading ? (
          <View style={chatStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>

        /* State 2: confirmed non-participant (or left the run mid-session) */
        ) : !isParticipant ? (
          <View style={chatStyles.gatedContainer}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
            <Text style={[chatStyles.gatedTitle, { color: colors.textPrimary }]}>
              Participants only
            </Text>
            <Text style={[chatStyles.gatedSubtext, { color: colors.textMuted }]}>
              Join this run to view and send messages.
            </Text>
          </View>

        /* State 3: Firestore denied the read — defensive fallback, not a crash */
        ) : messagesError ? (
          <View style={chatStyles.gatedContainer}>
            <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
            <Text style={[chatStyles.gatedTitle, { color: colors.textPrimary }]}>
              Chat unavailable
            </Text>
            <Text style={[chatStyles.gatedSubtext, { color: colors.textMuted }]}>
              Could not load messages. Try going back and rejoining the run.
            </Text>
          </View>

        /* State 4: participant confirmed, waiting on first messages snapshot */
        ) : messagesLoading ? (
          <View style={chatStyles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>

        /* State 4: normal chat */
        ) : (
          <>
            <FlatList
              ref={flatListRef}
              data={messages}
              renderItem={renderMessage}
              keyExtractor={keyExtractor}
              contentContainerStyle={[
                chatStyles.messageList,
                messages.length === 0 && chatStyles.messageListEmpty,
              ]}
              onContentSizeChange={scrollToBottom}
              ListEmptyComponent={
                <View style={chatStyles.emptyContainer}>
                  <Ionicons name="chatbubbles-outline" size={48} color={colors.textMuted} />
                  <Text style={[chatStyles.emptyTitle, { color: colors.textPrimary }]}>
                    No messages yet
                  </Text>
                  <Text style={[chatStyles.emptySubtext, { color: colors.textMuted }]}>
                    Be the first to say something!
                  </Text>
                </View>
              }
            />

            {/* Bottom bar — input for active chats, expiry notice for closed ones */}
            {isChatExpired ? (
              <View
                style={[
                  chatStyles.expiredBar,
                  {
                    backgroundColor: colors.surface,
                    borderTopColor: colors.border,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING.sm,
                  },
                ]}
              >
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={[chatStyles.expiredText, { color: colors.textMuted }]}>
                  This run chat has ended
                </Text>
              </View>
            ) : (
              <View
                style={[
                  chatStyles.inputBar,
                  {
                    backgroundColor: colors.background,
                    borderTopColor: colors.border,
                    paddingBottom: insets.bottom > 0 ? insets.bottom : SPACING.sm,
                  },
                ]}
              >
                <TextInput
                  style={[
                    chatStyles.textInput,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.textPrimary,
                    },
                  ]}
                  placeholder="Message..."
                  placeholderTextColor={colors.textMuted}
                  value={inputText}
                  onChangeText={setInputText}
                  maxLength={500}
                  multiline
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  style={[
                    chatStyles.sendButton,
                    {
                      backgroundColor:
                        inputText.trim() ? colors.primary : colors.surfaceLight,
                    },
                  ]}
                  onPress={handleSend}
                  disabled={!inputText.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons
                      name="send"
                      size={18}
                      color={inputText.trim() ? '#fff' : colors.textMuted}
                    />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Static styles (no theme dependency) — theme colors are applied inline above.

const chatStyles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  messageListEmpty: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxxl,
    gap: SPACING.xs,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.small,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
  },

  // Message rows
  messageRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
    alignItems: 'flex-end',
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  avatarWrapper: {
    marginRight: SPACING.xs,
    marginBottom: 2,
  },
  bubbleWrapper: {
    maxWidth: '75%',
  },
  bubbleWrapperOwn: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 2,
    marginLeft: 2,
  },
  bubble: {
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  bubbleOwn: {
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    borderWidth: 1,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: FONT_SIZES.body,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
    marginHorizontal: 2,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.xs,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
    fontSize: FONT_SIZES.body,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  // Expired chat bar — replaces the input bar after chatExpiresAt
  expiredBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACING.xxs,
  },
  expiredText: {
    fontSize: FONT_SIZES.small,
  },

  // Gated state — shown when user is confirmed non-participant
  // (or has left the run mid-session)
  gatedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xs,
  },
  gatedTitle: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: SPACING.sm,
  },
  gatedSubtext: {
    fontSize: FONT_SIZES.small,
    textAlign: 'center',
  },
});
