/**
 * MessagesScreen.js — Unified Messages Inbox
 *
 * Shows two sections:
 *   1. Direct Messages  — 1:1 DM conversations, ordered by most recent activity.
 *   2. Run Chats        — Group chat threads for every run the user is currently in.
 *
 * Search bar at the top:
 *   - Instantly filters existing DMs by player name or last message text.
 *   - Instantly filters Run Chats by gym name.
 *   - After 400 ms debounce (≥ 2 chars), also queries Firestore users by
 *     username prefix and shows a "Players" section so you can start a new
 *     conversation without leaving the screen.
 *
 * Entry points:
 *   - HomeScreen header Messages icon (HomeStack)
 *   - ProfileScreen "Messages" row (ProfileStack)
 *
 * Navigation: registered in HomeStack and ProfileStack (App.js).
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  SectionList,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts';
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { auth, db } from '../config/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';
import { useConversations } from '../hooks';
import { useMyRunChats } from '../hooks/useMyRunChats';
import { openOrCreateConversation } from '../services/dmService';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 48;
const SEARCH_LIMIT = 10;
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 400;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * formatConversationTime — Relative timestamp for a conversation row.
 *   Today     → "2:35 PM"
 *   This week → "Mon"
 *   Older     → "Mar 15"
 */
function formatConversationTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * formatRunTime — Formats a Firestore Timestamp or Date into "7:00 PM".
 */
function formatRunTime(timestamp) {
  if (!timestamp) return null;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * getOtherUser — Extracts the other participant's name and avatar from a
 * conversation doc, given the current user's uid. Used for both filtering
 * and rendering.
 */
function getOtherUser(item, uid) {
  const otherUid = item.participantIds?.find((id) => id !== uid);
  const otherUser = otherUid ? item.participants?.[otherUid] : null;
  return {
    uid: otherUid,
    name: otherUser?.name || 'Player',
    avatar: otherUser?.avatar || null,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConversationAvatar({ uri, name, colors }) {
  const [imgError, setImgError] = useState(false);

  const initials = name
    ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  if (uri && !imgError) {
    return (
      <Image
        source={{ uri }}
        style={styles.avatarImage}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <View style={[styles.avatarFallback, { backgroundColor: colors.primary }]}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}

/**
 * RunChatAvatar — Shows the gym thumbnail photo when available.
 * Resolution order: GYM_LOCAL_IMAGES[gymId] → remote imageUrl → basketball icon.
 */
function RunChatAvatar({ gymId, gymImageUrl, colors }) {
  const [imgError, setImgError] = useState(false);

  const localAsset = gymId ? GYM_LOCAL_IMAGES[gymId] : null;
  const remoteUri = !imgError && gymImageUrl ? { uri: gymImageUrl } : null;
  const source = localAsset || remoteUri;

  if (source) {
    return (
      <Image
        source={source}
        style={styles.avatarImage}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: basketball icon
  return (
    <View style={[styles.avatarFallback, { backgroundColor: colors.surface ?? '#1a1a1a' }]}>
      <Ionicons name="basketball-outline" size={22} color={colors.primary} />
    </View>
  );
}

function SectionHeader({ title, colors }) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>{title}</Text>
    </View>
  );
}

// ─── Row renderers ─────────────────────────────────────────────────────────────

function DMRow({ item, uid, colors, navigation }) {
  const { uid: otherUid, name: otherName, avatar: otherAvatar } = getOtherUser(item, uid);

  const lastSeen = item.lastSeenAt?.[uid]?.toMillis?.() ?? 0;
  const lastActivity = item.lastActivityAt?.toMillis?.() ?? 0;
  const isUnread = lastActivity > lastSeen;

  const previewText = item.lastMessage?.text || 'No messages yet';
  const timeLabel = formatConversationTime(item.lastActivityAt);

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      activeOpacity={0.7}
      onPress={() =>
        navigation.navigate('DMConversation', {
          conversationId: item.id,
          otherUserId: otherUid,
          otherUserName: otherName,
          otherUserAvatar: otherAvatar,
        })
      }
    >
      <ConversationAvatar uri={otherAvatar} name={otherName} colors={colors} />

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.rowName,
              { color: colors.textPrimary },
              isUnread && styles.rowNameUnread,
            ]}
            numberOfLines={1}
          >
            {otherName}
          </Text>
          <Text style={[styles.rowTime, { color: colors.textMuted }]}>{timeLabel}</Text>
        </View>

        <View style={styles.rowBottom}>
          <Text
            style={[
              styles.rowPreview,
              { color: isUnread ? colors.textPrimary : colors.textMuted },
              isUnread && styles.rowPreviewUnread,
            ]}
            numberOfLines={1}
          >
            {previewText}
          </Text>
          {isUnread && (
            <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function RunChatRow({ item, colors, navigation }) {
  const gymName = item.gymName || 'Run Chat';
  const timeLabel = formatRunTime(item.startTime);
  const rowTitle = timeLabel ? `${gymName} – ${timeLabel}` : gymName;
  const isUnread = !!item.isUnread;

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      activeOpacity={0.7}
      onPress={() =>
        navigation.navigate('RunChat', {
          runId: item.runId,
          gymId: item.gymId,
          gymName,
          startTime: item.startTime ?? null,
        })
      }
    >
      <RunChatAvatar gymId={item.gymId} gymImageUrl={item.gymImageUrl} colors={colors} />

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.rowName,
              { color: colors.textPrimary },
              isUnread && styles.rowNameUnread,
            ]}
            numberOfLines={1}
          >
            {rowTitle}
          </Text>
        </View>

        <View style={styles.rowBottom}>
          <Text
            style={[
              styles.rowPreview,
              { color: isUnread ? colors.textPrimary : colors.textMuted },
              isUnread && styles.rowPreviewUnread,
            ]}
            numberOfLines={1}
          >
            Group chat
          </Text>
          {isUnread && (
            <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * PlayerRow — Result row for a Firestore user search hit.
 * Tapping opens or creates a DM conversation and navigates into it.
 */
function PlayerRow({ item, colors, navigation, setSearchQuery }) {
  const [opening, setOpening] = useState(false);

  const handlePress = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const conversationId = await openOrCreateConversation(item.uid);
      setSearchQuery('');
      navigation.navigate('DMConversation', {
        conversationId,
        otherUserId: item.uid,
        otherUserName: item.name,
        otherUserAvatar: item.photoURL || null,
      });
    } catch (e) {
      console.warn('PlayerRow open conversation error:', e);
    } finally {
      setOpening(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      activeOpacity={0.7}
      onPress={handlePress}
      disabled={opening}
    >
      <ConversationAvatar uri={item.photoURL} name={item.name} colors={colors} />

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.name}
          </Text>
          {opening && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        {item.username ? (
          <Text style={[styles.rowPreview, { color: colors.textMuted }]} numberOfLines={1}>
            @{item.username}
          </Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ─── Search Bar ───────────────────────────────────────────────────────────────

function SearchBar({ value, onChangeText, onClear, colors }) {
  const inputRef = useRef(null);

  return (
    <View style={[styles.searchBar, { backgroundColor: colors.surface ?? '#1a1a1a', borderColor: colors.border }]}>
      <Ionicons name="search-outline" size={16} color={colors.textMuted} style={styles.searchIcon} />
      <TextInput
        ref={inputRef}
        style={[styles.searchInput, { color: colors.textPrimary }]}
        placeholder="Search messages or players…"
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={onClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MessagesScreen({ navigation }) {
  const { colors } = useTheme();
  const uid = auth.currentUser?.uid;
  const { conversations, loading: dmsLoading } = useConversations();
  const { runChats, loading: runChatsLoading } = useMyRunChats();

  const [searchQuery, setSearchQuery] = useState('');
  const [playerResults, setPlayerResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceTimer = useRef(null);

  const loading = dmsLoading || runChatsLoading;

  // ── Player search (Firestore, debounced) ─────────────────────────────────
  useEffect(() => {
    const trimmed = searchQuery.trim().toLowerCase();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setPlayerResults([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(async () => {
      try {
        const prefix = trimmed;
        const prefixEnd =
          prefix.slice(0, -1) +
          String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);

        const q = query(
          collection(db, 'users'),
          where('usernameLower', '>=', prefix),
          where('usernameLower', '<', prefixEnd),
          orderBy('usernameLower'),
          limit(SEARCH_LIMIT),
        );

        const snap = await getDocs(q);
        const results = [];
        snap.forEach((doc) => {
          const data = doc.data();
          if (doc.id !== uid) {
            results.push({
              uid: doc.id,
              name: data.name || 'Player',
              username: data.username || null,
              photoURL: data.photoURL || null,
            });
          }
        });
        setPlayerResults(results);
      } catch (e) {
        console.warn('MessagesScreen player search error:', e);
        setPlayerResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceTimer.current);
  }, [searchQuery, uid]);

  // ── Filtered sections ────────────────────────────────────────────────────
  const sections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isSearching = q.length > 0;

    if (!isSearching) {
      // ── Default view ─────────────────────────────────────────────────────
      const secs = [];
      secs.push({
        title: 'Direct Messages',
        type: 'dm',
        data: conversations.length > 0 ? conversations : [{ _empty: true, _type: 'dm' }],
      });
      if (runChats.length > 0) {
        secs.push({ title: 'Run Chats', type: 'runChat', data: runChats });
      }
      return secs;
    }

    // ── Search view ───────────────────────────────────────────────────────
    const secs = [];

    // Filter DMs by player name or last message text
    const filteredDMs = conversations.filter((conv) => {
      const { name } = getOtherUser(conv, uid);
      const preview = conv.lastMessage?.text || '';
      return (
        name.toLowerCase().includes(q) ||
        preview.toLowerCase().includes(q)
      );
    });

    if (filteredDMs.length > 0) {
      secs.push({ title: 'Direct Messages', type: 'dm', data: filteredDMs });
    }

    // Filter run chats by gym name
    const filteredRunChats = runChats.filter((rc) =>
      (rc.gymName || '').toLowerCase().includes(q)
    );

    if (filteredRunChats.length > 0) {
      secs.push({ title: 'Run Chats', type: 'runChat', data: filteredRunChats });
    }

    // Player search results (Firestore)
    if (searchLoading) {
      secs.push({ title: 'Players', type: 'playerLoading', data: [{ _loading: true }] });
    } else if (playerResults.length > 0) {
      secs.push({ title: 'Players', type: 'player', data: playerResults });
    } else if (q.length >= MIN_QUERY_LENGTH && !searchLoading) {
      secs.push({ title: 'Players', type: 'playerEmpty', data: [{ _empty: true, _type: 'player' }] });
    }

    return secs;
  }, [searchQuery, conversations, runChats, playerResults, searchLoading, uid]);

  // All hooks must be called before any conditional return.
  const handleClear = useCallback(() => setSearchQuery(''), []);

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search bar — always visible above the list */}
      <View style={[styles.searchBarWrapper, { borderBottomColor: colors.border }]}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={handleClear}
          colors={colors}
        />
      </View>

      <SectionList
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(item, index) =>
          item.id ?? item.uid ?? item._type ?? `idx-${index}`
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader title={section.title} colors={colors} />
        )}
        renderItem={({ item, section }) => {
          // ── Empty / loading placeholders ─────────────────────────────────
          if (item._loading) {
            return (
              <View style={styles.sectionEmptyContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            );
          }

          if (item._empty) {
            const msg =
              item._type === 'player'
                ? 'No players found.'
                : 'Message a player from their profile to start a conversation.';
            return (
              <View style={styles.sectionEmptyContainer}>
                <Text style={[styles.sectionEmptyText, { color: colors.textMuted }]}>
                  {msg}
                </Text>
              </View>
            );
          }

          // ── Row types ──────────────────────────────────────────────────────
          if (section.type === 'dm') {
            return <DMRow item={item} uid={uid} colors={colors} navigation={navigation} />;
          }

          if (section.type === 'runChat') {
            return <RunChatRow item={item} colors={colors} navigation={navigation} />;
          }

          if (section.type === 'player') {
            return (
              <PlayerRow
                item={item}
                colors={colors}
                navigation={navigation}
                setSearchQuery={setSearchQuery}
              />
            );
          }

          return null;
        }}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    flexGrow: 1,
  },

  // Search bar
  searchBarWrapper: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.sm,
    height: 38,
    gap: 6,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    paddingVertical: 0,
  },

  // Section header
  sectionHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionHeaderText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Section empty placeholder
  sectionEmptyContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  sectionEmptyText: {
    fontSize: FONT_SIZES.small,
    lineHeight: 20,
  },

  // Conversation row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: SPACING.sm,
  },

  // Avatar
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: FONT_SIZES.small,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // Row content
  rowContent: {
    flex: 1,
    minWidth: 0,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.medium,
    flex: 1,
    marginRight: SPACING.xs,
  },
  rowNameUnread: {
    fontWeight: FONT_WEIGHTS.bold,
  },
  rowTime: {
    fontSize: FONT_SIZES.xs,
    flexShrink: 0,
  },
  rowPreview: {
    fontSize: FONT_SIZES.small,
    flex: 1,
  },
  rowPreviewUnread: {
    fontWeight: FONT_WEIGHTS.medium,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: SPACING.xs,
    flexShrink: 0,
  },
});
