/**
 * SearchUsersScreen.js — User Search by Username
 *
 * Live search screen that queries Firestore for users by username as the
 * user types. Uses prefix matching on `usernameLower` with a 400ms debounce
 * to avoid excessive Firestore reads.
 *
 * Results display avatar, display name, and @username.
 * Tapping a result navigates to that user's profile.
 *
 * Navigation: HomeStack → SearchUsers, ProfileStack → SearchUsers
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_SIZES, SPACING, RADIUS, FONT_WEIGHTS, BUTTON_HEIGHT } from '../constants/theme';
import { useTheme } from '../contexts';
import { db, auth } from '../config/firebase';
import { sanitizeUsername } from '../utils/sanitize';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore';

/** Maximum results to return per search. */
const SEARCH_LIMIT = 15;

/** Minimum characters before a search fires. */
const MIN_QUERY_LENGTH = 2;

/** Debounce delay in milliseconds. */
const DEBOUNCE_MS = 400;

/**
 * SearchUsersScreen — Find players by username with live suggestions.
 *
 * @param {object} props
 * @param {import('@react-navigation/native').NavigationProp<any>} props.navigation
 * @returns {JSX.Element}
 */
export default function SearchUsersScreen({ navigation }) {
  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const debounceTimer = useRef(null);
  const inputRef = useRef(null);

  const currentUid = auth.currentUser?.uid;

  // Auto-focus the search input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  /**
   * runSearch — Queries Firestore for users whose usernameLower starts
   * with the given prefix. Called by the debounce effect.
   */
  const runSearch = async (text) => {
    const trimmed = text.trim().toLowerCase();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const prefix = trimmed;
      const prefixEnd = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);

      const q = query(
        collection(db, 'users'),
        where('usernameLower', '>=', prefix),
        where('usernameLower', '<', prefixEnd),
        orderBy('usernameLower'),
        limit(SEARCH_LIMIT),
      );

      const snap = await getDocs(q);
      const users = [];
      snap.forEach((doc) => {
        const data = doc.data();
        if (doc.id !== currentUid) {
          users.push({
            uid: doc.id,
            name: data.name || 'Player',
            username: data.username || null,
            photoURL: data.photoURL || null,
          });
        }
      });
      setResults(users);
    } catch (error) {
      if (__DEV__) console.warn('[SearchUsers] Query error:', error.code || error.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * handleTextChange — Updates search text and triggers a debounced search.
   */
  const handleTextChange = (text) => {
    const safe = sanitizeUsername(text);
    setSearchText(safe);

    // Clear any pending debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    const trimmed = safe.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setHasSearched(false);
      setLoading(false);
      return;
    }

    // Show loading immediately so the user sees feedback
    setLoading(true);

    // Debounce the actual Firestore query — pass the sanitized value
    debounceTimer.current = setTimeout(() => {
      runSearch(safe);
    }, DEBOUNCE_MS);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  /**
   * handleClear — Resets the search state.
   */
  const handleClear = () => {
    setSearchText('');
    setResults([]);
    setHasSearched(false);
    setLoading(false);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    inputRef.current?.focus();
  };

  /**
   * renderUserRow — Renders a single search result row.
   */
  const renderUserRow = ({ item }) => (
    <TouchableOpacity
      style={styles.userRow}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('UserProfile', { userId: item.uid })}
    >
      {item.photoURL ? (
        <Image source={{ uri: item.photoURL }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Ionicons name="person" size={20} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
        {item.username ? (
          <Text style={styles.userUsername} numberOfLines={1}>@{item.username}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );

  // Determine which empty state to show
  const trimmedLength = searchText.trim().length;
  const showInitialState = trimmedLength === 0;
  const showMinCharsHint = trimmedLength > 0 && trimmedLength < MIN_QUERY_LENGTH;
  const showNoResults = hasSearched && !loading && results.length === 0;

  return (
    <View style={styles.container}>
      {/* ── Search Bar ── */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search by username..."
          placeholderTextColor={colors.textMuted}
          value={searchText}
          onChangeText={handleTextChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searchText.length > 0 && (
          <TouchableOpacity onPress={handleClear}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── States ── */}
      {showInitialState ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={36} color={colors.textMuted} />
          <Text style={styles.emptyText}>Search for players by username</Text>
        </View>
      ) : showMinCharsHint ? (
        <View style={styles.centered}>
          <Text style={styles.hintText}>Type at least 2 characters</Text>
        </View>
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : showNoResults ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyText}>No players found</Text>
          <Text style={styles.emptySubtext}>Try a different username</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.uid}
          renderItem={renderUserRow}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const getStyles = (colors, isDark) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    margin: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    height: BUTTON_HEIGHT.md,
    gap: SPACING.sm,
    ...(isDark
      ? { borderWidth: 0 }
      : { borderWidth: 1, borderColor: colors.border }),
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.body,
    color: colors.textPrimary,
  },
  list: {
    paddingHorizontal: SPACING.md,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
    ...(isDark
      ? { borderWidth: 0 }
      : { borderWidth: 1, borderColor: colors.border }),
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  userName: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textPrimary,
  },
  userUsername: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    marginTop: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZES.body,
    fontWeight: FONT_WEIGHTS.semibold,
    color: colors.textSecondary,
    marginTop: SPACING.sm,
  },
  emptySubtext: {
    fontSize: FONT_SIZES.small,
    color: colors.textMuted,
    marginTop: SPACING.xs,
  },
  hintText: {
    fontSize: FONT_SIZES.body,
    color: colors.textMuted,
  },
});
