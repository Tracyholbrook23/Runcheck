/**
 * GymMapScreen.js — Interactive Gym Map View · Court Energy Redesign
 *
 * Dark map + pulsing energy rings + trading-card popup (V3 spec).
 * Brand orange (#FF6B35) = FIRE tier so the hottest courts match the accent.
 *
 * SCREENSHOT_MODE — flip to true to inject fake player counts for screenshots.
 */

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Platform,
  TouchableOpacity, Animated, Easing, Dimensions, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const RUNCHECK_LOGO = require('../assets/logo/runcheck-logo-transparent.png');
const COURT_BG     = require('../assets/images/court-bg.jpg');
import { FONT_SIZES, SPACING, FONT_WEIGHTS, RADIUS } from '../constants/theme';
import { GYM_LOCAL_IMAGES } from '../constants/gymAssets';

let MapView, Marker;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker  = Maps.Marker;
}

import { useTheme } from '../contexts';
import { useGyms, useLocation } from '../hooks';
import { useLivePresenceMap } from '../hooks';
import { db } from '../config/firebase';
import { collection, getDocs } from 'firebase/firestore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── SCREENSHOT MODE ──────────────────────────────────────────────────────────
const SCREENSHOT_MODE = false;
// Counts by gym index so they work with any Firestore IDs
const MOCK_COUNTS_BY_INDEX = [20, 18, 16, 15, 13, 11, 9, 8, 6, 5, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0];

const AUSTIN_CENTER = {
  latitude: 30.2672, longitude: -97.7431,
  latitudeDelta: 0.12, longitudeDelta: 0.12,
};

// ─── Activity tiers ───────────────────────────────────────────────────────────
const getActivityPin = (count) => {
  if (count >= 15) return { color: '#FF6B35', emoji: '🔥', label: 'FIRE',   rarity: '🔥 ON FIRE',    tier: 'fire',   color2: '#C0392B' };
  if (count >= 8)  return { color: '#FBBF24', emoji: '🍿', label: 'POPPIN', rarity: '🍿 POPPIN\'',   tier: 'poppin', color2: '#F97316' };
  if (count >= 1)  return { color: '#22C55E', emoji: '✅', label: 'ACTIVE', rarity: '✅ ACTIVE',     tier: 'active', color2: '#059669' };
  return                  { color: '#6B7280', emoji: '💀', label: 'DEAD',   rarity: '💀 DEAD COURT', tier: 'dead',   color2: '#374151' };
};

const getTierCTA = (tier) => {
  switch (tier) {
    case 'fire':   return '🏀  GET IN THE GAME';
    case 'poppin': return '🏀  JOIN THE RUN';
    case 'active': return '🏀  COME HOOP';
    default:       return '🏀  START THE RUN';
  }
};

const computeEnergy = (count) => Math.min(100, Math.round((count / 15) * 100));
const computePower  = (count) => count * 100;

// ─── Dark map style ───────────────────────────────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#0f1923' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#8ba3b0' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#0f1923' }] },
  { featureType: 'landscape',           elementType: 'geometry', stylers: [{ color: '#131c27' }] },
  { featureType: 'poi',                 elementType: 'geometry', stylers: [{ color: '#1a2535' }] },
  { featureType: 'poi',                 elementType: 'labels.text.fill', stylers: [{ color: '#6f9ba5' }] },
  { featureType: 'poi.park',            elementType: 'geometry.fill', stylers: [{ color: '#0e2233' }] },
  { featureType: 'road',                elementType: 'geometry', stylers: [{ color: '#243447' }] },
  { featureType: 'road',                elementType: 'geometry.stroke', stylers: [{ color: '#1a2d3e' }] },
  { featureType: 'road',                elementType: 'labels.text.fill', stylers: [{ color: '#6b8fa0' }] },
  { featureType: 'road.highway',        elementType: 'geometry', stylers: [{ color: '#1e3a4a' }] },
  { featureType: 'road.highway',        elementType: 'geometry.stroke', stylers: [{ color: '#163040' }] },
  { featureType: 'road.highway',        elementType: 'labels.text.fill', stylers: [{ color: '#8fb8c4' }] },
  { featureType: 'transit',             elementType: 'geometry', stylers: [{ color: '#2a3d52' }] },
  { featureType: 'water',               elementType: 'geometry.fill', stylers: [{ color: '#060e18' }] },
  { featureType: 'water',               elementType: 'labels.text.fill', stylers: [{ color: '#3d6070' }] },
  { featureType: 'administrative',           elementType: 'geometry.stroke',      stylers: [{ color: '#2a3d52' }] },
  // City / town names — bright so users can orient themselves
  { featureType: 'administrative.locality', elementType: 'labels.text.fill',   stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.stroke', stylers: [{ color: '#0f1923' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#c8dde8' }] },
];

// ─── EnergyPin ────────────────────────────────────────────────────────────────
function EnergyPin({ playerCount, pin, selected }) {
  const isDead = pin.tier === 'dead';

  const outerPulse = useRef(new Animated.Value(0)).current;
  const midPulse   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isDead) return;
    outerPulse.setValue(0);
    midPulse.setValue(0);

    const outerAnim = Animated.loop(
      Animated.timing(outerPulse, {
        toValue: 1, duration: 2400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    );
    const midAnim = Animated.loop(
      Animated.sequence([
        Animated.delay(800),
        Animated.timing(midPulse, {
          toValue: 1, duration: 2400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    outerAnim.start();
    midAnim.start();
    return () => { outerAnim.stop(); midAnim.stop(); };
  }, [isDead, pin.tier]);

  const outerSize = pin.tier === 'fire' ? 110 : pin.tier === 'poppin' ? 80 : 55;
  const midSize   = Math.round(outerSize * 0.65);
  const pinSize   = selected ? 44 : 32;
  const containerSize = outerSize + 20;

  return (
    <View style={{ width: containerSize, height: containerSize, alignItems: 'center', justifyContent: 'center' }}>
      {/* Outer pulse ring */}
      {!isDead && (
        <Animated.View style={{
          position: 'absolute',
          width: outerSize, height: outerSize, borderRadius: outerSize / 2,
          backgroundColor: pin.color + '22',
          borderWidth: 1, borderColor: pin.color + '40',
          transform: [{ scale: outerPulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.6] }) }],
          opacity:   outerPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        }} />
      )}
      {/* Mid ring */}
      {!isDead && (
        <Animated.View style={{
          position: 'absolute',
          width: midSize, height: midSize, borderRadius: midSize / 2,
          backgroundColor: pin.color + '15',
          borderWidth: 1, borderColor: pin.color + '60',
          transform: [{ scale: midPulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.4] }) }],
          opacity:   midPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
        }} />
      )}
      {/* Pin body + badge */}
      <View>
        <View style={{
          width: pinSize, height: pinSize, borderRadius: pinSize / 2,
          backgroundColor: pin.color,
          borderWidth: selected ? 3 : 2,
          borderColor: selected ? '#FFFFFF' : pin.color,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: pin.color,
          shadowRadius: selected ? 16 : 10,
          shadowOpacity: isDead ? 0.3 : 0.85,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        }}>
          <Text style={{ fontSize: selected ? 20 : 14 }}>{pin.emoji}</Text>
        </View>
        {/* Count badge — hide for dead */}
        {playerCount > 0 && (
          <View style={{
            position: 'absolute', top: -4, right: -8,
            minWidth: 18, height: 18, paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: '#000',
            borderWidth: 1.5, borderColor: pin.color,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{playerCount}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Court Trading Card ───────────────────────────────────────────────────────
function CourtCard({ selection, onDismiss, onNavigate, onReviews }) {
  if (!selection) return null;
  const { gym, playerCount, pin } = selection;
  const isDead = pin.tier === 'dead';

  // Animations
  const entryAnim = useRef(new Animated.Value(0)).current;
  const spinAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Card entry spring
    entryAnim.setValue(0);
    Animated.spring(entryAnim, {
      toValue: 1, friction: 8, tension: 50, useNativeDriver: true,
    }).start();

    // Logo spin (always, even for dead — just slower)
    spinAnim.setValue(0);
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: isDead ? 14000 : 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinLoop.start();

    return () => { spinLoop.stop(); };
  }, [selection.gym.id]);

  const cardTranslateY = entryAnim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const cardScale      = entryAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const cardOpacity    = entryAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });
  const spinRotate     = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // Gym photo — fall back to court background if none
  const gymPhoto = GYM_LOCAL_IMAGES[gym.id] || gym.imageUrl || gym.photoURL || gym.photo || COURT_BG;

  const cardH = Math.min(440, SCREEN_H * 0.58);
  const energy = computeEnergy(playerCount);

  // Fetch real rating from reviews subcollection when card opens
  const [ratingDisplay, setRatingDisplay] = useState('…');
  useEffect(() => {
    setRatingDisplay('…');
    getDocs(collection(db, 'gyms', gym.id, 'reviews'))
      .then((snap) => {
        if (snap.empty) { setRatingDisplay('–'); return; }
        const avg = snap.docs.reduce((sum, d) => sum + (d.data().rating || 0), 0) / snap.size;
        setRatingDisplay(avg.toFixed(1));
      })
      .catch(() => setRatingDisplay('–'));
  }, [gym.id]);

  return (
    <>
      {/* Dimmed backdrop */}
      <TouchableOpacity style={cStyles.backdrop} activeOpacity={1} onPress={onDismiss} />

      {/* Animated card */}
      <Animated.View style={[cStyles.wrapper, {
        height: cardH,
        shadowColor: pin.color,
        shadowRadius: 30, shadowOpacity: 0.55,
        shadowOffset: { width: 0, height: 12 }, elevation: 20,
        transform: [{ translateY: cardTranslateY }, { scale: cardScale }],
        opacity: cardOpacity,
      }]}>
        {/* Gradient border */}
        <LinearGradient
          colors={[pin.color, pin.color2, pin.color]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={cStyles.gradBorder}
        >
          {/* Inner card */}
          <View style={cStyles.innerCard}>

            {/* Top row: status pill + player count */}
            <View style={cStyles.topRow}>
              <View style={[cStyles.rarityPill, { backgroundColor: pin.color }]}>
                <Text style={cStyles.rarityText}>{pin.rarity}</Text>
              </View>
              <View style={cStyles.playerCountBadge}>
                <Text style={cStyles.playerCountNum}>{playerCount}</Text>
                <Text style={cStyles.playerCountLabel}> players here</Text>
              </View>
            </View>

            {/* Hero: gym photo bg + spinning RunCheck logo */}
            <View style={cStyles.hero}>
              {/* Gym photo background */}
              <Image
                source={typeof gymPhoto === 'string' ? { uri: gymPhoto } : gymPhoto}
                style={StyleSheet.absoluteFillObject}
                resizeMode="cover"
              />
              {/* Dark overlay tinted with tier color */}
              <LinearGradient
                colors={['rgba(0,0,0,0.35)', pin.color + '55', 'rgba(0,0,0,0.55)']}
                start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
              />
              {/* RunCheck logo */}
              <Image
                source={RUNCHECK_LOGO}
                style={cStyles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Court name + address */}
            <Text
              style={[cStyles.courtName, {
                textShadowColor: pin.color + '80',
                textShadowRadius: 12,
                textShadowOffset: { width: 0, height: 0 },
              }]}
              numberOfLines={1}
            >
              {gym.name}
            </Text>
            <Text style={cStyles.courtAddress} numberOfLines={1}>
              {gym.address ? gym.address.toUpperCase() : 'LOCATION UNAVAILABLE'}
            </Text>

            {/* Stats grid */}
            <View style={cStyles.statsRow}>
              {/* HERE */}
              <View style={[cStyles.statCell, { borderColor: pin.color + '30' }]}>
                <Text style={cStyles.statIcon}>👥</Text>
                <Text style={cStyles.statValue}>{playerCount}</Text>
                <Text style={cStyles.statLabel}>HERE</Text>
              </View>
              {/* ENERGY */}
              <View style={[cStyles.statCell, { borderColor: pin.color + '30' }]}>
                <Text style={cStyles.statIcon}>⚡</Text>
                <Text style={cStyles.statValue}>{energy}</Text>
                <Text style={cStyles.statLabel}>ENERGY</Text>
              </View>
              {/* RATED — tappable, navigates to gym reviews */}
              <TouchableOpacity
                style={[cStyles.statCell, { borderColor: pin.color + '60' }]}
                onPress={onReviews}
                activeOpacity={0.7}
              >
                <Text style={cStyles.statIcon}>⭐</Text>
                <Text style={cStyles.statValue}>{ratingDisplay}</Text>
                <Text style={[cStyles.statLabel, { color: pin.color }]}>RATED ›</Text>
              </TouchableOpacity>
            </View>

            {/* CTA */}
            <TouchableOpacity onPress={onNavigate} activeOpacity={0.85}>
              <LinearGradient
                colors={[pin.color, pin.color2]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[cStyles.ctaBtn, {
                  shadowColor: pin.color, shadowRadius: 10,
                  shadowOpacity: 0.55, shadowOffset: { width: 0, height: 4 },
                }]}
              >
                <Text style={cStyles.ctaText}>{getTierCTA(pin.tier)}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Close button */}
        <TouchableOpacity
          style={cStyles.closeBtn}
          onPress={onDismiss}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </Animated.View>
    </>
  );
}

const cStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  wrapper: {
    position: 'absolute',
    bottom: 80, left: 24, right: 24,
  },
  gradBorder: {
    flex: 1, padding: 3, borderRadius: 22,
  },
  innerCard: {
    flex: 1, borderRadius: 19, padding: 12, overflow: 'hidden',
    backgroundColor: '#0D0D0D',
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  rarityPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
  },
  rarityText: {
    fontSize: 10, fontWeight: '900', letterSpacing: 1, color: '#FFFFFF',
  },
  playerCountBadge: {
    flexDirection: 'row', alignItems: 'baseline',
  },
  playerCountNum: {
    fontSize: 18, fontWeight: '900', color: '#FFFFFF',
  },
  playerCountLabel: {
    fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)',
  },
  hero: {
    flex: 1, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8, overflow: 'hidden', minHeight: 100,
  },
  logo: {
    width: 80, height: 80,
    opacity: 0.95,
  },
  courtName: {
    fontSize: 16, fontWeight: '900', letterSpacing: -0.3,
    color: '#FFFFFF', marginBottom: 2,
  },
  courtAddress: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 8,
  },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  statCell: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderRadius: 8,
    paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center',
  },
  statIcon:  { fontSize: 12, marginBottom: 2 },
  statValue: { fontSize: 13, fontWeight: '900', color: '#FFFFFF' },
  statLabel: {
    fontSize: 7, fontWeight: '800', letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.5)', marginTop: 1,
  },
  ctaBtn: {
    paddingVertical: 11, borderRadius: 10, alignItems: 'center', elevation: 4,
  },
  ctaText: {
    fontSize: 13, fontWeight: '900', letterSpacing: 0.5, color: '#FFFFFF',
  },
  closeBtn: { position: 'absolute', top: 10, right: 10 },
});

// ─── Map Legend ───────────────────────────────────────────────────────────────
const LEGEND_TIERS = [
  {
    emoji: '🔥', label: 'On fire', sub: '15+', color: '#FF6B35',
    desc: '15+ players are here right now. This court is jumping — go get in on it.',
  },
  {
    emoji: '🍿', label: 'Poppin',  sub: '8–14', color: '#FBBF24',
    desc: '8–14 players on the court. Good runs happening — grab a spot before it fills up.',
  },
  {
    emoji: '✅', label: 'Active',  sub: '1–7',  color: '#22C55E',
    desc: '1–7 players checked in. Someone\'s out there — head over and get it going.',
  },
  {
    emoji: '💀', label: 'Dead',    sub: '0',    color: '#6B7280',
    desc: 'Nobody\'s here right now. Be the first to show up and start a run.',
  },
];

function MapLegend({ filterColor, onFilter }) {
  const [expandedLabel, setExpandedLabel] = useState(null);

  const handlePress = (tier) => {
    // Toggle description; also toggle filter
    const isExpanded = expandedLabel === tier.label;
    setExpandedLabel(isExpanded ? null : tier.label);
    onFilter(filterColor === tier.color ? null : tier.color);
  };

  return (
    <View style={legSt.container}>
      <View style={legSt.titleRow}>
        <Text style={legSt.title}>HEAT</Text>
        {filterColor && (
          <TouchableOpacity
            style={legSt.clearBtn}
            onPress={() => { onFilter(null); setExpandedLabel(null); }}
            activeOpacity={0.7}
          >
            <Text style={legSt.clearText}>✕ All</Text>
          </TouchableOpacity>
        )}
      </View>
      {LEGEND_TIERS.map((tier) => {
        const { emoji, label, sub, color, desc } = tier;
        const isExpanded = expandedLabel === label;
        return (
          <View key={label}>
            <TouchableOpacity
              style={[legSt.row, isExpanded && { backgroundColor: color + '18', borderRadius: 6 }]}
              onPress={() => handlePress(tier)}
              activeOpacity={0.7}
            >
              <View style={[legSt.dot, { backgroundColor: color }]}>
                <Text style={legSt.dotEmoji}>{emoji}</Text>
              </View>
              <Text style={[legSt.label, { color }]}>{label}</Text>
              <Text style={legSt.sub}>{sub}</Text>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={11}
                color="rgba(255,255,255,0.35)"
              />
            </TouchableOpacity>
            {isExpanded && (
              <View style={[legSt.descBox, { borderLeftColor: color }]}>
                <Text style={legSt.descText}>{desc}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const legSt = StyleSheet.create({
  container: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000', shadowRadius: 8, shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 2 }, elevation: 8,
    minWidth: 150, maxWidth: 200,
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  title: {
    fontSize: 9, fontWeight: '800', letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.45)',
  },
  clearBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  clearText: {
    fontSize: 9, fontWeight: '700', color: '#FFFFFF',
  },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5, paddingHorizontal: 4 },
  dot:      { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  dotEmoji: { fontSize: 10 },
  label:    { fontSize: 11, fontWeight: '700', flex: 1, color: '#FFFFFF' },
  sub:      { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600' },
  descBox:  {
    borderLeftWidth: 2, marginLeft: 12, marginBottom: 4,
    paddingLeft: 8, paddingVertical: 2,
  },
  descText: {
    fontSize: 10, color: 'rgba(255,255,255,0.65)',
    lineHeight: 14, fontWeight: '500',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function GymMapScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const { gyms, loading }             = useGyms();
  const { location, getCurrentLocation } = useLocation();
  const { countMap: liveCountMap }    = useLivePresenceMap();
  const mapRef = useRef(null);

  const [selectedGym, setSelectedGym] = useState(null);
  const [filterColor, setFilterColor] = useState(null);

  useEffect(() => {
    navigation.setOptions({ title: 'Nearby Courts' });
  }, [navigation]);

  useEffect(() => {
    getCurrentLocation().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!location || !mapRef.current) return;
    mapRef.current.animateToRegion(
      { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.12, longitudeDelta: 0.12 },
      600,
    );
  }, [location]);

  const handleRecenter = async () => {
    if (!mapRef.current) return;
    try {
      const coords = await getCurrentLocation();
      mapRef.current.animateToRegion(
        { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.12, longitudeDelta: 0.12 },
        400,
      );
    } catch { /* silent */ }
  };

  const openCard = useCallback((gym, playerCount, pin) => {
    setSelectedGym({ gym, playerCount, pin });
  }, []);

  const closeCard = useCallback(() => {
    setSelectedGym(null);
  }, []);

  const initialRegion = location
    ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.12, longitudeDelta: 0.12 }
    : AUSTIN_CENTER;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading map...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Map view not available on web.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        minZoomLevel={8}
        testID="gym-map"
        userInterfaceStyle="dark"
        showsUserLocation
        showsMyLocationButton={false}
        onPress={selectedGym ? closeCard : undefined}
      >
        {gyms.map((gym, idx) => {
          if (!gym.location) return null;

          const playerCount = SCREENSHOT_MODE
            ? (MOCK_COUNTS_BY_INDEX[idx] ?? 0)
            : (liveCountMap[gym.id] ?? 0);
          const pin = getActivityPin(playerCount);

          // Legend filter — hide non-matching gyms
          if (filterColor && pin.color !== filterColor) return null;

          const isSelected = selectedGym?.gym.id === gym.id;

          return (
            <Marker
              key={gym.id}
              coordinate={{ latitude: gym.location.latitude, longitude: gym.location.longitude }}
              testID={`marker-${gym.id}`}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={isSelected}
              onPress={() => openCard(gym, playerCount, pin)}
            >
              <EnergyPin playerCount={playerCount} pin={pin} selected={isSelected} />
            </Marker>
          );
        })}
      </MapView>

      {/* Trading card popup */}
      {selectedGym && (
        <CourtCard
          selection={selectedGym}
          onDismiss={closeCard}
          onNavigate={() => {
            closeCard();
            navigation.navigate('RunDetails', {
              gymId:   selectedGym.gym.id,
              gymName: selectedGym.gym.name,
              players: selectedGym.playerCount,
            });
          }}
          onReviews={() => {
            closeCard();
            navigation.navigate('GymReviews', {
              gymId:   selectedGym.gym.id,
              gymName: selectedGym.gym.name,
            });
          }}
        />
      )}

      {/* Legend — top-right, hidden while card is open */}
      {!selectedGym && (
        <MapLegend filterColor={filterColor} onFilter={setFilterColor} />
      )}

      {/* Recenter */}
      <TouchableOpacity
        style={[styles.recenterBtn, selectedGym && styles.recenterBtnRaised]}
        onPress={handleRecenter}
        activeOpacity={0.8}
        accessibilityLabel="Center map on my location"
      >
        <Ionicons name="locate" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const getStyles = (colors, isDark) =>
  StyleSheet.create({
    safe:        { flex: 1, backgroundColor: '#0A0818' },
    centered:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: SPACING.md, fontSize: FONT_SIZES.body, color: colors.textSecondary },
    map:         { flex: 1 },
    recenterBtn: {
      position: 'absolute', bottom: 28, right: 14,
      width: 46, height: 46, borderRadius: 23,
      backgroundColor: colors.primary,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.6, shadowRadius: 8, elevation: 6,
    },
    recenterBtnRaised: { bottom: 520 },
  });
