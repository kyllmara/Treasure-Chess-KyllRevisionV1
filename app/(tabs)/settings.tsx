import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  Modal,
  FlatList,
  Switch,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  ChevronRight,
  ChevronDown,
  X,
  Search,
  Check,
  LogOut,
  MessageCircle,
  Shield,
  FileText,
  Trophy,
  SlidersHorizontal,
  Box,
  Sparkles,
  Zap,
  User,
} from "lucide-react-native";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserStore } from "@/stores/userStore";
import { useRouter } from "expo-router";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { useToast } from "@/components/ToastNotification";
import { Colors, FontFamily, Spacing, BorderRadius, Shadows } from "@/constants/theme";

import {
  usernameSchema,
  validate,
  getValidationErrors,
  sanitizeUsername,
  logger,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
} from "@/lib/security";

import {
  useChess3DStore,
  THEMES_3D,
  FREE_THEMES,
  PREMIUM_THEMES,
  getTheme,
  type QualityPreset,
} from "@/lib/chess3d";

// ============================================================================
// Constants
// ============================================================================

const LANGUAGES = ["English", "Spanish", "French", "Dutch", "Portuguese", "German", "Arabic"];

const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
  "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon",
  "Canada", "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica",
  "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "East Timor", "Ecuador",
  "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia", "Fiji", "Finland", "France", "Gabon",
  "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
  "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait", "Kyrgyzstan",
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", "Macedonia",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "Norway", "Oman", "Pakistan",
  "Palau", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania",
  "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal",
  "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea",
  "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", "Swaziland", "Sweden", "Switzerland", "Syria", "Taiwan",
  "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu",
  "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela",
  "Vietnam", "Yemen", "Zambia", "Zimbabwe",
];

// ============================================================================
// 3D Chess Settings (inline sub-component, preserved from original)
// ============================================================================

const QUALITY_OPTIONS: { value: QualityPreset; label: string; description: string }[] = [
  { value: "low",    label: "Low",    description: "30 FPS, basic effects" },
  { value: "medium", label: "Medium", description: "60 FPS, standard effects" },
  { value: "high",   label: "High",   description: "60 FPS, enhanced effects" },
  { value: "ultra",  label: "Ultra",  description: "60 FPS, all effects enabled" },
];

function Chess3DSettings() {
  const {
    enable3D,
    setEnable3D,
    qualityPreset,
    setQualityPreset,
    themeId,
    setTheme,
    animations,
    setAnimations,
    effects,
    setEffects,
    reduceMotion,
    setReduceMotion,
  } = useChess3DStore();

  return (
    <View style={s3d.container}>
      <View style={s3d.toggleRow}>
        <View style={s3d.toggleInfo}>
          <View style={s3d.toggleTitleRow}>
            <Box size={18} color={Colors.primary} />
            <Text style={s3d.toggleTitle}>3D Chess Board</Text>
          </View>
          <Text style={s3d.toggleDescription}>
            Immersive 3D rendering with dynamic lighting
          </Text>
        </View>
        <Switch
          value={enable3D}
          onValueChange={setEnable3D}
          trackColor={{ false: Colors.border, true: Colors.primary }}
          thumbColor={enable3D ? "#fff" : Colors.textMuted}
        />
      </View>

      {enable3D && (
        <>
          <View style={s3d.divider} />
          <Text style={s3d.subHeader}>Quality</Text>
          <View style={s3d.qualityGrid}>
            {QUALITY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[s3d.qualityOption, qualityPreset === opt.value && s3d.qualityOptionSelected]}
                onPress={() => setQualityPreset(opt.value)}
              >
                <Text style={[s3d.qualityLabel, qualityPreset === opt.value && s3d.qualityLabelSelected]}>
                  {opt.label}
                </Text>
                <Text style={s3d.qualityDesc}>{opt.description}</Text>
                {qualityPreset === opt.value && (
                  <View style={s3d.checkBadge}>
                    <Check size={12} color={Colors.background} />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={s3d.divider} />
          <Text style={s3d.subHeader}>Theme</Text>
          <View style={s3d.themeGrid}>
            {Object.values(THEMES_3D).map((theme) => {
              const isPremium = PREMIUM_THEMES.includes(theme.id);
              const isSelected = themeId === theme.id;
              return (
                <TouchableOpacity
                  key={theme.id}
                  style={[s3d.themeOption, isSelected && s3d.themeOptionSelected]}
                  onPress={() => setTheme(theme.id)}
                >
                  <View style={[s3d.themeColor, { backgroundColor: theme.lightSquareColor }]} />
                  <Text style={[s3d.themeLabel, isSelected && s3d.themeLabelSelected]} numberOfLines={1}>
                    {theme.name}
                  </Text>
                  {isPremium && <Sparkles size={10} color={Colors.primary} />}
                  {isSelected && (
                    <View style={s3d.checkBadge}>
                      <Check size={12} color={Colors.background} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s3d.divider} />
          <Text style={s3d.subHeader}>Visual Effects</Text>

          <View style={s3d.toggleRow}>
            <View style={s3d.toggleInfo}>
              <View style={s3d.toggleTitleRow}>
                <Sparkles size={16} color={Colors.textSecondary} />
                <Text style={s3d.effectLabel}>Particle Effects</Text>
              </View>
              <Text style={s3d.toggleDescription}>Capture explosions, move trails</Text>
            </View>
            <Switch
              value={animations.enableParticles}
              onValueChange={(v) => setAnimations({ enableParticles: v })}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={animations.enableParticles ? "#fff" : Colors.textMuted}
            />
          </View>

          <View style={s3d.toggleRow}>
            <View style={s3d.toggleInfo}>
              <View style={s3d.toggleTitleRow}>
                <Box size={16} color={Colors.textSecondary} />
                <Text style={s3d.effectLabel}>Dynamic Shadows</Text>
              </View>
              <Text style={s3d.toggleDescription}>Real-time shadow casting</Text>
            </View>
            <Switch
              value={effects.enableShadows}
              onValueChange={(v) => setEffects({ enableShadows: v })}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={effects.enableShadows ? "#fff" : Colors.textMuted}
            />
          </View>

          <View style={s3d.toggleRow}>
            <View style={s3d.toggleInfo}>
              <View style={s3d.toggleTitleRow}>
                <SlidersHorizontal size={16} color={Colors.textSecondary} />
                <Text style={s3d.effectLabel}>Move Animations</Text>
              </View>
              <Text style={s3d.toggleDescription}>Piece glide, capture smoke</Text>
            </View>
            <Switch
              value={animations.enableMoveAnimations}
              onValueChange={(v) => setAnimations({ enableMoveAnimations: v })}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={animations.enableMoveAnimations ? "#fff" : Colors.textMuted}
            />
          </View>

          <View style={s3d.toggleRow}>
            <View style={s3d.toggleInfo}>
              <View style={s3d.toggleTitleRow}>
                <Zap size={16} color={Colors.textSecondary} />
                <Text style={s3d.effectLabel}>Reduce Motion</Text>
              </View>
              <Text style={s3d.toggleDescription}>Minimise animations for accessibility</Text>
            </View>
            <Switch
              value={reduceMotion}
              onValueChange={setReduceMotion}
              trackColor={{ false: Colors.border, true: Colors.primary }}
              thumbColor={reduceMotion ? "#fff" : Colors.textMuted}
            />
          </View>
        </>
      )}
    </View>
  );
}

// ============================================================================
// Shared sub-components
// ============================================================================

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function NavRow({
  icon,
  label,
  value,
  onPress,
  badge,
  last,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string;
  onPress: () => void;
  badge?: number;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && <View style={styles.rowIcon}>{icon}</View>}
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {badge != null && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}
        <ChevronRight size={16} color={Colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

function InfoRow({
  icon,
  label,
  value,
  last,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      {icon && <View style={styles.rowIcon}>{icon}</View>}
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, styles.rowValueMuted]}>{value}</Text>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function SettingsScreen() {
  const { user, updateProfile, t } = useApp();
  const { profile, user: authUser, isAuthenticated, logout, refreshProfile } = useAuth();
  const userStoreProfile = useUserStore((state) => state.profile);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showSuccess } = useToast();

  // ── Profile edit state ───────────────────────────────────────────────────
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showAvatarUrlModal, setShowAvatarUrlModal] = useState(false);
  const [avatarUrlInput, setAvatarUrlInput] = useState("");

  // Username — seeded from userStore (most up-to-date), then auth profile, then local
  const [username, setUsername] = useState<string>(
    userStoreProfile?.username || profile?.username || user.username
  );
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const usernameCheckRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Avatar — seeded from auth profile (server), then local
  const [profilePicture, setProfilePicture] = useState<string>(
    (profile as any)?.profile_picture_url || user.profilePicture
  );

  // Re-seed avatar when auth profile loads asynchronously.
  // Without this effect, the avatar shows the local default on first open
  // because profile is undefined at mount time (async auth check).
  useEffect(() => {
    const serverPic = (profile as any)?.profile_picture_url;
    if (serverPic) setProfilePicture(serverPic);
  }, [(profile as any)?.profile_picture_url]);

  // Re-seed username when userStore profile updates (e.g., returning after save)
  useEffect(() => {
    if (userStoreProfile?.username) setUsername(userStoreProfile.username);
  }, [userStoreProfile?.username]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Account pickers ──────────────────────────────────────────────────────
  const [country, setCountry] = useState<string>(user.country);
  const [language, setLanguage] = useState<string>(user.language);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

  // ── Misc ─────────────────────────────────────────────────────────────────
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);

  // Load unread support ticket count
  useEffect(() => {
    if (isAuthenticated && profile?.id && isSupabaseConfigured) {
      supabase
        .rpc("get_user_unread_support_count", { p_user_id: profile.id })
        .then(({ data }) => {
          if (typeof data === "number") setUnreadSupportCount(data);
        });
    }
  }, [isAuthenticated, profile?.id]);

  // Refresh store on mount
  useEffect(() => {
    if (isAuthenticated) {
      useUserStore.getState().syncWithServer();
      useUserStore.getState().refreshBalance();
    }
  }, [isAuthenticated]);


  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRIES;
    return COUNTRIES.filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase()));
  }, [countrySearch]);

  // ── Username validation ──────────────────────────────────────────────────

  const validateUsername = React.useCallback(
    async (value: string) => {
      if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
      if (!value) { setUsernameError(null); return; }
      if (value.length < MIN_USERNAME_LENGTH) {
        setUsernameError(`Username must be at least ${MIN_USERNAME_LENGTH} characters`);
        return;
      }
      if (value.length > MAX_USERNAME_LENGTH) {
        setUsernameError(`Username must be at most ${MAX_USERNAME_LENGTH} characters`);
        return;
      }
      const usernameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
      if (!usernameRegex.test(value)) {
        if (/^_/.test(value) || /_$/.test(value)) {
          setUsernameError("Username cannot start or end with an underscore");
        } else if (/[^a-zA-Z0-9_]/.test(value)) {
          setUsernameError("Username can only contain letters, numbers, and underscores");
        } else {
          setUsernameError("Invalid username format");
        }
        return;
      }
      if (value.includes("__")) { setUsernameError("Username cannot contain consecutive underscores"); return; }
      if (/admin|moderator|support|system|help|root/i.test(value)) {
        setUsernameError("This username is reserved");
        return;
      }
      const sanitized = sanitizeUsername(value);
      if (sanitized === profile?.username) { setUsernameError(null); return; }
      setIsCheckingUsername(true);
      usernameCheckRef.current = setTimeout(async () => {
        try {
          if (isAuthenticated && profile?.id && isSupabaseConfigured) {
            const { data: existing, error } = await supabase
              .from("profiles")
              .select("id")
              .eq("username", sanitized)
              .neq("id", profile.id)
              .maybeSingle();
            if (!error && existing) {
              setUsernameError("This username is already taken");
            } else {
              setUsernameError(null);
            }
          } else {
            setUsernameError(null);
          }
        } finally {
          setIsCheckingUsername(false);
        }
      }, 500);
    },
    [profile?.id, profile?.username, isAuthenticated]
  );

  const handleUsernameChange = React.useCallback(
    (value: string) => { setUsername(value); validateUsername(value); },
    [validateUsername]
  );

  useEffect(() => () => { if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current); }, []);

  // ── Save profile (username + avatar) ─────────────────────────────────────

  const handleSave = async () => {
    if (usernameError) return;
    const validation = validate(usernameSchema, username);
    if (!validation.success) {
      const errors = getValidationErrors(validation.errors);
      setUsernameError(errors[0] || "Please enter a valid username");
      return;
    }
    const sanitizedUsername = sanitizeUsername(username);
    setIsSaving(true);
    setSaveError(null);
    logger.info("Settings", "Saving profile", { sanitizedUsername });

    try {
      if (isAuthenticated && profile?.id && isSupabaseConfigured) {
        if (sanitizedUsername !== profile.username) {
          const { data: existing } = await supabase
            .from("profiles")
            .select("id")
            .eq("username", sanitizedUsername)
            .neq("id", profile.id)
            .maybeSingle();
          if (existing) {
            setUsernameError("This username is already taken");
            setIsSaving(false);
            return;
          }
        }

        const { error, data } = await supabase.rpc("update_user_profile", {
          p_profile_id: profile.id,
          p_username: sanitizedUsername,
          p_profile_picture_url: profilePicture,
        });

        const rpcNotFound =
          error &&
          (error.code === "PGRST202" ||
            error.code === "42883" ||
            error.message?.includes("Could not find the function") ||
            error.message?.includes("not found"));

        if (error && !rpcNotFound) {
          if (error.message?.includes("Username already taken")) {
            setUsernameError("This username is already taken");
          } else {
            setSaveError("Failed to save profile. Please try again.");
          }
          setIsSaving(false);
          return;
        }

        if (rpcNotFound) {
          const { error: directError, data: directData } = await supabase
            .from("profiles")
            .update({
              username: sanitizedUsername,
              profile_picture_url: profilePicture,
              updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id)
            .select();
          if (directError || !directData?.length) {
            setSaveError(directError?.message || "Unable to update profile. Please try again.");
            setIsSaving(false);
            return;
          }
        }

        useUserStore.getState().updateProfile({ username: sanitizedUsername });
        try { await refreshProfile(); } catch {}
      }

      updateProfile({ username: sanitizedUsername, email: authUser?.email || user.email, profilePicture });
      logger.info("Settings", "Profile saved", { sanitizedUsername });

      setShowProfileEdit(false);
      showSuccess("Profile saved");
    } catch (err) {
      logger.error("Settings", "Error saving profile", { error: err });
      setSaveError("Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Avatar handlers ───────────────────────────────────────────────────────

  const handleApplyAvatarUrl = () => {
    const trimmed = avatarUrlInput.trim();
    if (trimmed) setProfilePicture(trimmed);
    setShowAvatarUrlModal(false);
    setAvatarUrlInput("");
  };

  // ── Account picker handlers ───────────────────────────────────────────────

  const handleSelectCountry = (selected: string) => {
    setCountry(selected);
    setShowCountryModal(false);
    setCountrySearch("");
    updateProfile({ country: selected });
  };

  const handleSelectLanguage = (selected: string) => {
    setLanguage(selected);
    setShowLanguageModal(false);
    updateProfile({ language: selected });
  };

  // ── Refresh ───────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await useUserStore.getState().syncWithServer();
      await useUserStore.getState().refreshBalance();
      const refreshed = useUserStore.getState().profile;
      if (refreshed?.username) setUsername(refreshed.username);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            try {
              await logout();
              router.replace("/");
            } catch {
              Alert.alert("Error", "Failed to log out. Please try again.");
            }
          },
        },
      ]
    );
  };

  // ── Derived display values ─────────────────────────────────────────────────
  const displayUsername = userStoreProfile?.username || profile?.username || username || "—";
  const displayEmail = authUser?.email || profile?.email || user.email || "Not set";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* ── Page title ──────────────────────────────────────────────── */}
        <Text style={styles.pageTitle}>Settings</Text>

        {/* ── Profile card ────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.profileCard}
          onPress={() => { setSaveError(null); setShowProfileEdit(true); }}
          activeOpacity={0.8}
        >
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.profileAvatar} />
          ) : (
            <View style={styles.profileAvatarPlaceholder}>
              <User size={28} color={Colors.primary} />
            </View>
          )}
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{displayUsername}</Text>
            <Text style={styles.profileSub}>{displayEmail}</Text>
          </View>
          <View style={styles.editChip}>
            <Text style={styles.editChipText}>Edit</Text>
          </View>
        </TouchableOpacity>

        {/* ── Stats ───────────────────────────────────────────────────── */}
        {isAuthenticated && (
          <>
            <SectionHeader title="Stats" />
            <View style={styles.card}>
              <View style={styles.statsGrid}>
                <StatBox label="Wins" value={userStoreProfile?.gamesWon ?? 0} />
                <StatBox label="Losses" value={userStoreProfile?.gamesLost ?? 0} />
                <StatBox label="Draws" value={userStoreProfile?.gamesDrawn ?? 0} />
                <StatBox label="ELO" value={userStoreProfile?.eloRating ?? 1200} />
                <StatBox label="Streak" value={userStoreProfile?.currentStreak ?? 0} />
                <StatBox
                  label="Earnings"
                  value={`$${(((userStoreProfile?.totalWonTct ?? 0) - (userStoreProfile?.totalLostTct ?? 0)) / 25).toFixed(2)}`}
                />
              </View>
            </View>
          </>
        )}

        {/* ── Account ─────────────────────────────────────────────────── */}
        <SectionHeader title="Account" />
        <View style={styles.card}>
          <NavRow
            label="Country"
            value={country}
            onPress={() => setShowCountryModal(true)}
          />
          <NavRow
            label="Language"
            value={language}
            onPress={() => setShowLanguageModal(true)}
            last
          />
        </View>

        {/* ── Game Preferences ────────────────────────────────────────── */}
        <SectionHeader title="Game Preferences" />
        <View style={styles.card}>
          <NavRow
            icon={<SlidersHorizontal size={18} color={Colors.textSecondary} />}
            label="Board, Pieces & Sound"
            onPress={() => router.push("/game-settings")}
          />
          <View style={styles.rowLast}>
            <Chess3DSettings />
          </View>
        </View>

        {/* ── Support ─────────────────────────────────────────────────── */}
        <SectionHeader title="Support" />
        <View style={styles.card}>
          <NavRow
            icon={<MessageCircle size={18} color={Colors.textSecondary} />}
            label="Help & Support"
            badge={unreadSupportCount}
            onPress={() => router.push("/support")}
          />
          <NavRow
            icon={<Trophy size={18} color={Colors.textSecondary} />}
            label="Rewards"
            onPress={() => router.push("/rewards")}
            last
          />
        </View>

        {/* ── Legal ───────────────────────────────────────────────────── */}
        <SectionHeader title="Legal" />
        <View style={styles.card}>
          <NavRow
            icon={<FileText size={18} color={Colors.textSecondary} />}
            label="Terms of Service"
            onPress={() => Alert.alert("Terms of Service", "Visit our website to read the full Terms of Service.")}
          />
          <NavRow
            icon={<Shield size={18} color={Colors.textSecondary} />}
            label="Privacy Policy"
            onPress={() => Alert.alert("Privacy Policy", "Visit our website to read our full Privacy Policy.")}
            last
          />
        </View>

        {/* ── Log Out ─────────────────────────────────────────────────── */}
        {isAuthenticated && (
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.75}>
            <LogOut size={18} color={Colors.negative} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: insets.bottom + Spacing.xxxl }} />
      </ScrollView>

      {/* ================================================================
          Profile Edit Bottom Sheet
         ================================================================ */}
      <Modal
        visible={showProfileEdit}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProfileEdit(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowProfileEdit(false)} style={styles.sheetClose}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Avatar picker */}
            <View style={styles.avatarEditRow}>
              {profilePicture ? (
                <Image source={{ uri: profilePicture }} style={styles.editAvatar} />
              ) : (
                <View style={styles.editAvatarPlaceholder}>
                  <User size={36} color={Colors.primary} />
                </View>
              )}
              <TouchableOpacity style={styles.changeAvatarBtn} onPress={() => { setAvatarUrlInput(profilePicture || ""); setShowAvatarUrlModal(true); }}>
                <Camera size={16} color={Colors.onPrimary} />
                <Text style={styles.changeAvatarText}>Change Avatar</Text>
              </TouchableOpacity>
            </View>

            {/* Username input */}
            <Text style={styles.inputLabel}>Username</Text>
            <TextInput
              style={[styles.input, usernameError ? styles.inputError : null]}
              value={username}
              onChangeText={handleUsernameChange}
              placeholder="Enter username"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {isCheckingUsername && (
              <View style={styles.checkingRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.checkingText}>Checking availability…</Text>
              </View>
            )}
            {usernameError && !isCheckingUsername && (
              <Text style={styles.fieldError}>{usernameError}</Text>
            )}

            {saveError && <Text style={styles.saveErrorText}>{saveError}</Text>}

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveBtn, (isSaving || !!usernameError || isCheckingUsername) && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={isSaving || !!usernameError || isCheckingUsername}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <Text style={styles.saveBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================================================================
          Avatar URL Modal
         ================================================================ */}
      <Modal
        visible={showAvatarUrlModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAvatarUrlModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Set Avatar</Text>
              <TouchableOpacity onPress={() => setShowAvatarUrlModal(false)} style={styles.sheetClose}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { marginTop: Spacing.md }]}>Image URL</Text>
            <TextInput
              style={styles.input}
              value={avatarUrlInput}
              onChangeText={setAvatarUrlInput}
              placeholder="https://..."
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={[styles.inputLabel, { fontSize: 12, marginTop: Spacing.sm, color: Colors.textMuted }]}>
              Enter any image URL (HTTPS). Supported: JPG, PNG, WebP.
            </Text>

            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: Spacing.xl }]}
              onPress={handleApplyAvatarUrl}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>Apply</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: Spacing.md, backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.border }]}
              onPress={() => { setProfilePicture(""); setShowAvatarUrlModal(false); setAvatarUrlInput(""); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.saveBtnText, { color: Colors.textSecondary }]}>Remove Avatar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================================================================
          Country Picker Modal
         ================================================================ */}
      <Modal
        visible={showCountryModal}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowCountryModal(false); setCountrySearch(""); }}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, styles.sheetTall, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Country</Text>
              <TouchableOpacity onPress={() => { setShowCountryModal(false); setCountrySearch(""); }} style={styles.sheetClose}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Search size={16} color={Colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search countries…"
                placeholderTextColor={Colors.textMuted}
                value={countrySearch}
                onChangeText={setCountrySearch}
              />
            </View>

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => handleSelectCountry(item)}
                >
                  <Text style={[styles.pickerItemText, item === country && styles.pickerItemSelected]}>
                    {item}
                  </Text>
                  {item === country && <Check size={16} color={Colors.primary} />}
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      {/* ================================================================
          Language Picker Modal
         ================================================================ */}
      <Modal
        visible={showLanguageModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Language</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)} style={styles.sheetClose}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang}
                style={styles.pickerItem}
                onPress={() => handleSelectLanguage(lang)}
              >
                <Text style={[styles.pickerItemText, lang === language && styles.pickerItemSelected]}>
                  {lang}
                </Text>
                {lang === language && <Check size={16} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================================
// StatBox helper
// ============================================================================

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ============================================================================
// Styles — 3D Settings
// ============================================================================

const s3d = StyleSheet.create({
  container: {
    paddingVertical: Spacing.md,
  },
  subHeader: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 11,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
    marginVertical: Spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  toggleInfo: { flex: 1, marginRight: Spacing.md },
  toggleTitleRow: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.xs },
  toggleTitle: { fontFamily: FontFamily.interSemiBold, fontSize: 15, color: Colors.textPrimary },
  toggleDescription: { fontFamily: FontFamily.interRegular, fontSize: 12, color: Colors.textMuted },
  effectLabel: { fontFamily: FontFamily.interMedium, fontSize: 14, color: Colors.textPrimary },
  qualityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  qualityOption: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  qualityOptionSelected: { borderColor: Colors.primary },
  qualityLabel: { fontFamily: FontFamily.interSemiBold, fontSize: 13, color: Colors.textSecondary },
  qualityLabelSelected: { color: Colors.primary },
  qualityDesc: { fontFamily: FontFamily.interRegular, fontSize: 11, color: Colors.textMuted, marginTop: Spacing.xs },
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  themeOption: {
    width: "30%",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  themeOptionSelected: { borderColor: Colors.primary },
  themeColor: { width: 32, height: 32, borderRadius: 16, marginBottom: Spacing.xs },
  themeLabel: { fontFamily: FontFamily.interRegular, fontSize: 10, color: Colors.textSecondary, textAlign: "center" },
  themeLabelSelected: { color: Colors.primary },
  checkBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ============================================================================
// Styles — Main Screen
// ============================================================================

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.lg },

  pageTitle: {
    fontFamily: FontFamily.quicksandMedium,
    fontSize: 28,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },

  // ── Profile card ────────────────────────────────────────────────────────
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
    ...Shadows.medium,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  profileAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontFamily: FontFamily.spaceGroteskSemiBold,
    fontSize: 17,
    color: Colors.textPrimary,
  },
  profileSub: {
    fontFamily: FontFamily.interRegular,
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
  editChip: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  editChipText: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 13,
    color: Colors.primary,
  },

  // ── Section header ───────────────────────────────────────────────────────
  sectionHeader: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },

  // ── Card (grouped rows) ──────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
    overflow: "hidden",
    ...Shadows.small,
  },

  // ── Row ──────────────────────────────────────────────────────────────────
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    minHeight: 52,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: `${Colors.primary}14`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  rowLabel: {
    flex: 1,
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  rowValue: {
    fontFamily: FontFamily.interRegular,
    fontSize: 14,
    color: Colors.textSecondary,
  },
  rowValueMuted: {
    color: Colors.textMuted,
  },

  // ── Badge ────────────────────────────────────────────────────────────────
  badge: {
    backgroundColor: Colors.negative,
    borderRadius: BorderRadius.pill,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontFamily: FontFamily.interBold,
    fontSize: 11,
    color: "#fff",
  },

  // ── Stats ────────────────────────────────────────────────────────────────
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statBox: {
    flex: 1,
    minWidth: "30%",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  statValue: {
    fontFamily: FontFamily.spaceGroteskBold,
    fontSize: 20,
    color: Colors.primary,
  },
  statLabel: {
    fontFamily: FontFamily.interRegular,
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },

  // ── Log out ──────────────────────────────────────────────────────────────
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    marginBottom: Spacing.xl,
    ...Shadows.small,
  },
  logoutText: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 15,
    color: Colors.negative,
  },

  // ── Bottom sheet ─────────────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingTop: Spacing.lg,
    maxHeight: "90%",
  },
  sheetTall: {
    maxHeight: "85%",
    flex: 0,
    height: "85%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  sheetTitle: {
    fontFamily: FontFamily.spaceGroteskSemiBold,
    fontSize: 18,
    color: Colors.textPrimary,
  },
  sheetClose: { padding: 4 },

  // ── Profile edit sheet ───────────────────────────────────────────────────
  avatarEditRow: {
    alignItems: "center",
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  editAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  editAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}18`,
    alignItems: "center",
    justifyContent: "center",
  },
  changeAvatarBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  changeAvatarText: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 13,
    color: Colors.onPrimary,
  },
  inputLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    color: Colors.textSecondary,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  input: {
    fontFamily: FontFamily.interRegular,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
  },
  inputError: { borderColor: Colors.negative },
  checkingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  checkingText: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  fieldError: {
    fontFamily: FontFamily.interRegular,
    fontSize: 12,
    color: Colors.negative,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  saveErrorText: {
    fontFamily: FontFamily.interRegular,
    fontSize: 13,
    color: Colors.negative,
    textAlign: "center",
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.pill,
    paddingVertical: Spacing.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontFamily: FontFamily.interSemiBold,
    fontSize: 15,
    color: Colors.onPrimary,
  },

  // ── Search box ───────────────────────────────────────────────────────────
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    margin: Spacing.lg,
    marginTop: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.interRegular,
    fontSize: 14,
    color: Colors.textPrimary,
  },

  // ── Picker items ─────────────────────────────────────────────────────────
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerItemText: {
    fontFamily: FontFamily.interRegular,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  pickerItemSelected: {
    fontFamily: FontFamily.interSemiBold,
    color: Colors.primary,
  },
});
