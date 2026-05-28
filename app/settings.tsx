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
import { LinearGradient } from "expo-linear-gradient";
import { Camera, Save, ChevronDown, X, Search, Check, Lock, Box, Sparkles, Zap, LogOut, ArrowLeft, MessageCircle } from "lucide-react-native";
import { useApp } from "@/contexts/AppContext";
import { useAuth } from "@/contexts/AuthContext";
import { useUserStore } from "@/stores/userStore";
import { useRouter } from "expo-router";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { BoardTheme, PieceStyle } from "@/types";
import { ChessPieceComponent } from "@/components/ChessPieces";
import { useDragonAvatars } from "@/hooks/useDragonAvatars";

// Security module imports
import {
  usernameSchema,
  emailSchema,
  validate,
  getValidationErrors,
  sanitizeUsername,
  sanitizeDisplayName,
  logger,
  MIN_USERNAME_LENGTH,
  MAX_USERNAME_LENGTH,
} from "@/lib/security";

// 3D Chess Board imports
import {
  useChess3DStore,
  THEMES_3D,
  FREE_THEMES,
  PREMIUM_THEMES,
  getTheme,
  type QualityPreset,
} from "@/lib/chess3d";

const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "Dutch",
  "Portuguese",
  "German",
  "Arabic"
];

const TEENAGE_DRAGON_START_INDEX = 9;
const TEENAGE_DRAGON_END_INDEX = 17;
const NON_FIERCE_ADULT_START_INDEX = 18;
const NON_FIERCE_ADULT_END_INDEX = 26;
const FIERCE_ADULT_START_INDEX = 27;
const FIERCE_ADULT_END_INDEX = 35;

const DRAGON_AVATARS = [
  "https://r2-pub.rork.com/generated-images/d987cb8d-3a1c-4153-b962-4f4a5a3bde41.png",
  "https://r2-pub.rork.com/generated-images/d93b981e-f6ea-4972-8107-b576496c24cb.png",
  "https://r2-pub.rork.com/generated-images/178d349f-b91d-42b8-ac42-9aa352cc4def.png",
  "https://r2-pub.rork.com/generated-images/fda8ce80-6fd8-4b5f-abfc-19bc79c31d5e.png",
  "https://r2-pub.rork.com/generated-images/6ece8f2e-1e13-4bed-be15-309669d9c15c.png",
  "https://r2-pub.rork.com/generated-images/657b192c-fb2e-4f82-8204-e9ec107e293d.png",
  "https://r2-pub.rork.com/generated-images/bc4aa1f6-2d6d-483e-8cb6-ca2e7b25e77d.png",
  "https://r2-pub.rork.com/generated-images/f78eaa5e-ef63-408e-9505-0d171c3b4e4c.png",
  "https://r2-pub.rork.com/generated-images/7be0c5cb-b02c-4377-82a1-df22516fe0ab.png",
  "https://r2-pub.rork.com/generated-images/0d77351e-5ae4-4fd4-85c9-d40337247e61.png",
  "https://r2-pub.rork.com/generated-images/2c7178ac-3096-416e-be22-cf009c5c489d.png",
  "https://r2-pub.rork.com/generated-images/69b5e875-14b0-4b40-bf22-96c695d6b2be.png",
  "https://r2-pub.rork.com/generated-images/47fcabb7-7000-4456-83c2-e6859069b70d.png",
  "https://r2-pub.rork.com/generated-images/f42d0447-3172-4b8a-80a2-d2b2050ff66a.png",
  "https://r2-pub.rork.com/generated-images/4d9bc44e-e1de-464f-8f12-4c7fe48c84d3.png",
  "https://r2-pub.rork.com/generated-images/af03441f-c644-46ce-8ab1-44a2a267ba28.png",
  "https://r2-pub.rork.com/generated-images/7b7d41b2-8aaf-4077-b084-b463d9da58c5.png",
  "https://r2-pub.rork.com/generated-images/4891fc39-750e-4ebd-b2fa-73600f8549a0.png",
  "https://r2-pub.rork.com/generated-images/d5421ced-b222-469e-86e9-bf57414cd738.png",
  "https://r2-pub.rork.com/generated-images/46bcf6c6-8dca-4af3-aa89-ce289ea66004.png",
  "https://r2-pub.rork.com/generated-images/2f70b854-6a4a-4f81-a1c8-857d5031cd61.png",
  "https://r2-pub.rork.com/generated-images/adf6e262-3a9b-4cdf-9e15-d41f4d687826.png",
  "https://r2-pub.rork.com/generated-images/b3053a7e-b6e6-45fd-aded-154af7b1bd06.png",
  "https://r2-pub.rork.com/generated-images/6086acd7-2054-4db0-a38b-ddb62d8173a7.png",
  "https://r2-pub.rork.com/generated-images/d4928689-63db-46a9-a7c4-806463141952.png",
  "https://r2-pub.rork.com/generated-images/637923f8-0483-4397-8775-a745526d7f32.png",
  "https://r2-pub.rork.com/generated-images/6c6df691-2973-4fa3-9236-d8ce2ce0a9b5.png",
  "https://r2-pub.rork.com/generated-images/4090decb-e03e-4e1e-836d-6a97455932cf.png",
  "https://r2-pub.rork.com/generated-images/4924e9b1-d303-43b7-8b57-3476ed6f13d1.png",
  "https://r2-pub.rork.com/generated-images/a3c6b842-cef7-4a61-a6c9-f84aeac959f8.png",
  "https://r2-pub.rork.com/generated-images/3f3a6e15-3411-4972-8348-766fa05572db.png",
  "https://r2-pub.rork.com/generated-images/6233121d-9638-41cd-9cc0-831af74194eb.png",
  "https://r2-pub.rork.com/generated-images/3f21ea07-c0f6-4802-9c4e-d7df12cc6b31.png",
  "https://r2-pub.rork.com/generated-images/c7776511-a385-4bf9-a051-7cce392c1409.png",
  "https://r2-pub.rork.com/generated-images/d0da5601-05dc-405b-b099-4e6b1ff8dd3e.png",
  "https://r2-pub.rork.com/generated-images/30e626dc-e0de-411a-859d-edd24d7608fc.png",
];

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
  "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

// ============================================================================
// 3D Chess Settings Component
// ============================================================================

const QUALITY_OPTIONS: { value: QualityPreset; label: string; description: string }[] = [
  { value: "low", label: "Low", description: "30 FPS, basic effects" },
  { value: "medium", label: "Medium", description: "60 FPS, standard effects" },
  { value: "high", label: "High", description: "60 FPS, enhanced effects" },
  { value: "ultra", label: "Ultra", description: "60 FPS, all effects enabled" },
];

function Chess3DSettings() {
  const {
    enable3D,
    setEnable3D,
    qualityPreset,
    setQualityPreset,
    themeId,
    setTheme,
    reduceMotion,
    setReduceMotion,
    effects,
    setEffects,
  } = useChess3DStore();

  const currentTheme = getTheme(themeId);

  return (
    <>
      {/* 3D Board Header */}
      <View style={styles.sectionHeader}>
        <Box size={20} color="#FFD700" />
        <Text style={styles.sectionHeaderText}>3D Board Settings</Text>
      </View>

      {/* Enable 3D Board */}
      <View style={styles.gameSettingCard}>
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <View style={styles.settingTitleRow}>
              <Sparkles size={16} color="#FFD700" />
              <Text style={styles.gameSettingTitle}>3D Chess Board</Text>
            </View>
            <Text style={styles.gameSettingDescription}>
              Enable immersive 3D board with animated pieces, shadows, and visual effects
            </Text>
          </View>
          <Switch
            value={enable3D}
            onValueChange={setEnable3D}
            trackColor={{ false: "#333", true: "#FFD700" }}
            thumbColor={enable3D ? "#FFA500" : "#666"}
          />
        </View>
      </View>

      {enable3D && (
        <>
          {/* Quality Preset */}
          <View style={styles.gameSettingCard}>
            <View style={styles.settingTitleRow}>
              <Zap size={16} color="#4ECDC4" />
              <Text style={styles.gameSettingTitle}>Quality Preset</Text>
            </View>
            <Text style={styles.gameSettingDescription}>
              Adjust visual quality based on your device performance
            </Text>
            <View style={styles.qualityGrid}>
              {QUALITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.qualityOption,
                    qualityPreset === option.value && styles.qualityOptionSelected,
                  ]}
                  onPress={() => setQualityPreset(option.value)}
                >
                  <Text
                    style={[
                      styles.qualityLabel,
                      qualityPreset === option.value && styles.qualityLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  <Text style={styles.qualityDescription}>{option.description}</Text>
                  {qualityPreset === option.value && (
                    <View style={styles.qualityCheck}>
                      <Check size={12} color="#0F0F1E" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 3D Theme */}
          <View style={styles.gameSettingCard}>
            <Text style={styles.gameSettingTitle}>3D Board Theme</Text>
            <Text style={styles.gameSettingDescription}>
              Choose a visual theme for your 3D board
            </Text>
            <View style={styles.theme3DGrid}>
              {FREE_THEMES.map((id) => {
                const theme = THEMES_3D[id];
                if (!theme) return null;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[
                      styles.theme3DOption,
                      themeId === id && styles.theme3DOptionSelected,
                    ]}
                    onPress={() => setTheme(id)}
                  >
                    <View style={styles.theme3DPreview}>
                      <View
                        style={[
                          styles.theme3DSquare,
                          { backgroundColor: theme.lightSquareColor },
                        ]}
                      />
                      <View
                        style={[
                          styles.theme3DSquare,
                          { backgroundColor: theme.darkSquareColor },
                        ]}
                      />
                    </View>
                    <Text style={styles.theme3DLabel}>{theme.name}</Text>
                    {themeId === id && (
                      <View style={styles.theme3DCheck}>
                        <Check size={12} color="#0F0F1E" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* Premium themes (locked) */}
              {PREMIUM_THEMES.slice(0, 2).map((id) => {
                const theme = THEMES_3D[id];
                if (!theme) return null;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.theme3DOption, styles.theme3DOptionLocked]}
                    onPress={() =>
                      Alert.alert(
                        "Premium Theme",
                        `${theme.name} is a premium theme. Unlock premium features to access this theme!`
                      )
                    }
                  >
                    <View style={styles.theme3DPreview}>
                      <View
                        style={[
                          styles.theme3DSquare,
                          { backgroundColor: theme.lightSquareColor, opacity: 0.5 },
                        ]}
                      />
                      <View
                        style={[
                          styles.theme3DSquare,
                          { backgroundColor: theme.darkSquareColor, opacity: 0.5 },
                        ]}
                      />
                    </View>
                    <Text style={[styles.theme3DLabel, { opacity: 0.5 }]}>
                      {theme.name}
                    </Text>
                    <View style={styles.premiumBadge}>
                      <Lock size={10} color="#FFD700" />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Visual Effects */}
          <View style={styles.gameSettingCard}>
            <Text style={styles.gameSettingTitle}>Visual Effects</Text>
            <View style={styles.effectsGrid}>
              <TouchableOpacity
                style={[
                  styles.effectOption,
                  effects.selectionGlow && styles.effectOptionEnabled,
                ]}
                onPress={() => setEffects({ selectionGlow: !effects.selectionGlow })}
              >
                <Text style={styles.effectLabel}>Selection Glow</Text>
                <Switch
                  value={effects.selectionGlow}
                  onValueChange={(v) => setEffects({ selectionGlow: v })}
                  trackColor={{ false: "#333", true: "#FFD700" }}
                  thumbColor={effects.selectionGlow ? "#FFA500" : "#666"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.effectOption,
                  effects.enableShadows && styles.effectOptionEnabled,
                ]}
                onPress={() => setEffects({ enableShadows: !effects.enableShadows })}
              >
                <Text style={styles.effectLabel}>Shadows</Text>
                <Switch
                  value={effects.enableShadows}
                  onValueChange={(v) => setEffects({ enableShadows: v })}
                  trackColor={{ false: "#333", true: "#FFD700" }}
                  thumbColor={effects.enableShadows ? "#FFA500" : "#666"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.effectOption,
                  effects.enableBloom && styles.effectOptionEnabled,
                ]}
                onPress={() => setEffects({ enableBloom: !effects.enableBloom })}
              >
                <Text style={styles.effectLabel}>Bloom Effect</Text>
                <Switch
                  value={effects.enableBloom}
                  onValueChange={(v) => setEffects({ enableBloom: v })}
                  trackColor={{ false: "#333", true: "#FFD700" }}
                  thumbColor={effects.enableBloom ? "#FFA500" : "#666"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.effectOption,
                  effects.lastMoveHighlight && styles.effectOptionEnabled,
                ]}
                onPress={() =>
                  setEffects({ lastMoveHighlight: !effects.lastMoveHighlight })
                }
              >
                <Text style={styles.effectLabel}>Last Move Highlight</Text>
                <Switch
                  value={effects.lastMoveHighlight}
                  onValueChange={(v) => setEffects({ lastMoveHighlight: v })}
                  trackColor={{ false: "#333", true: "#FFD700" }}
                  thumbColor={effects.lastMoveHighlight ? "#FFA500" : "#666"}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Reduce Motion */}
          <View style={styles.gameSettingCard}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.gameSettingTitle}>Reduce Motion</Text>
                <Text style={styles.gameSettingDescription}>
                  Disable particle effects and reduce animations for accessibility
                </Text>
              </View>
              <Switch
                value={reduceMotion}
                onValueChange={setReduceMotion}
                trackColor={{ false: "#333", true: "#FFD700" }}
                thumbColor={reduceMotion ? "#FFA500" : "#666"}
              />
            </View>
          </View>
        </>
      )}
    </>
  );
}

export default function SettingsScreen() {
  const { user, updateProfile, generatedDragon, generatedTeenageDragon, saveGeneratedTeenageDragon, t } = useApp();
  const { profile, user: authUser, isAuthenticated, logout, refreshProfile } = useAuth();
  const { isAvatarUnlocked, getUnlockHint, isLoading: isDragonLoading } = useDragonAvatars();
  // Get username from userStore which has the most up-to-date value
  const userStoreProfile = useUserStore((state) => state.profile);
  const router = useRouter();
  const [settingsTab, setSettingsTab] = useState<"user" | "game">("user");
  // Use userStore profile username (most up-to-date), fallback to auth profile, then local user
  const [username, setUsername] = useState<string>(userStoreProfile?.username || profile?.username || user.username);
  const [email, setEmail] = useState<string>(authUser?.email || profile?.email || user.email);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState<boolean>(false);
  const usernameCheckTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync username state when userStore profile changes (e.g., returning to settings after save)
  useEffect(() => {
    if (userStoreProfile?.username) {
      setUsername(userStoreProfile.username);
    }
  }, [userStoreProfile?.username]);

  // Validate username and check availability with debounce
  const validateUsername = React.useCallback(async (value: string) => {
    // Clear any pending check
    if (usernameCheckTimeoutRef.current) {
      clearTimeout(usernameCheckTimeoutRef.current);
    }

    // Clear error if empty (will be caught on save)
    if (!value) {
      setUsernameError(null);
      return;
    }

    // Check minimum length
    if (value.length < MIN_USERNAME_LENGTH) {
      setUsernameError(`Username must be at least ${MIN_USERNAME_LENGTH} characters`);
      return;
    }

    // Check maximum length
    if (value.length > MAX_USERNAME_LENGTH) {
      setUsernameError(`Username must be at most ${MAX_USERNAME_LENGTH} characters`);
      return;
    }

    // Check for invalid characters using regex
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

    // Check for consecutive underscores
    if (value.includes("__")) {
      setUsernameError("Username cannot contain consecutive underscores");
      return;
    }

    // Check for reserved words
    if (/admin|moderator|support|system|help|root/i.test(value)) {
      setUsernameError("This username is reserved");
      return;
    }

    // All local validation passed, check availability if username changed
    const sanitized = sanitizeUsername(value);
    if (sanitized === profile?.username) {
      setUsernameError(null);
      return;
    }

    // Debounce the availability check
    setIsCheckingUsername(true);
    usernameCheckTimeoutRef.current = setTimeout(async () => {
      try {
        if (isAuthenticated && profile?.id && isSupabaseConfigured) {
          const { data: existingUser, error: checkError } = await supabase
            .from("profiles")
            .select("id")
            .eq("username", sanitized)
            .neq("id", profile.id)
            .maybeSingle();

          if (checkError) {
            logger.error("Settings", "Error checking username", { error: checkError.message });
          } else if (existingUser) {
            setUsernameError("This username is already taken");
          } else {
            setUsernameError(null);
          }
        } else {
          setUsernameError(null);
        }
      } catch (error) {
        logger.error("Settings", "Error checking username availability", { error });
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);
  }, [profile?.id, profile?.username, isAuthenticated]);

  // Handle username change with validation
  const handleUsernameChange = React.useCallback((value: string) => {
    setUsername(value);
    validateUsername(value);
  }, [validateUsername]);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (usernameCheckTimeoutRef.current) {
        clearTimeout(usernameCheckTimeoutRef.current);
      }
    };
  }, []);
  const [country, setCountry] = useState<string>(user.country);
  const [language, setLanguage] = useState<string>(user.language);
  const [profilePicture, setProfilePicture] = useState<string>(
    (profile as any)?.profile_picture_url || user.profilePicture
  );
  const [boardTheme, setBoardTheme] = useState<BoardTheme>(user.gameSettings.boardTheme);
  const [pieceStyle, setPieceStyle] = useState<PieceStyle>(user.gameSettings.pieceStyle);
  const [soundEffects, setSoundEffects] = useState<boolean>(user.gameSettings.soundEffects);
  const [vibration, setVibration] = useState<boolean>(user.gameSettings.vibration);
  const [showCountryModal, setShowCountryModal] = useState<boolean>(false);
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(false);
  const [showAvatarModal, setShowAvatarModal] = useState<boolean>(false);
  const [countrySearch, setCountrySearch] = useState<string>("");
  const [isGeneratingTeenageDragon, setIsGeneratingTeenageDragon] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [unreadSupportCount, setUnreadSupportCount] = useState<number>(0);

  // Load unread support ticket count
  useEffect(() => {
    if (isAuthenticated && profile?.id) {
      supabase
        .rpc("get_user_unread_support_count", { p_user_id: profile.id })
        .then(({ data }) => {
          if (typeof data === "number") setUnreadSupportCount(data);
        });
    }
  }, [isAuthenticated, profile?.id]);

  // Refresh profile stats on mount
  useEffect(() => {
    if (isAuthenticated) {
      useUserStore.getState().syncWithServer();
      useUserStore.getState().refreshBalance();
    }
  }, [isAuthenticated]);

  // Auto-sync generated dragon to database if not already synced
  useEffect(() => {
    const syncDragonToDatabase = async () => {
      if (!isAuthenticated || !profile?.id) return;

      // Get the current profile_picture_url from database
      const dbProfilePicture = (profile as any)?.profile_picture_url;

      // If user has a generated dragon locally but not in database, sync it
      const localDragon = generatedTeenageDragon || generatedDragon;
      if (localDragon && !dbProfilePicture) {
        try {
          await supabase
            .from("profiles")
            .update({ profile_picture_url: localDragon })
            .eq("id", profile.id);
          console.log("[Settings] Auto-synced local dragon to database");
        } catch (e) {
          console.warn("[Settings] Failed to auto-sync dragon:", e);
        }
      }
    };
    syncDragonToDatabase();
  }, [isAuthenticated, profile?.id, generatedDragon, generatedTeenageDragon]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Refresh profile and balance from database
      await useUserStore.getState().syncWithServer();
      await useUserStore.getState().refreshBalance();

      // Update local state with refreshed username
      const refreshedProfile = useUserStore.getState().profile;
      if (refreshedProfile?.username) {
        setUsername(refreshedProfile.username);
      }
    } catch (error) {
      console.error("Failed to refresh settings:", error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const filteredCountries = useMemo(() => {
    if (!countrySearch) return COUNTRIES;
    return COUNTRIES.filter((c) =>
      c.toLowerCase().includes(countrySearch.toLowerCase())
    );
  }, [countrySearch]);

  const handleSave = async () => {
    // Check if there's an existing error from real-time validation
    if (usernameError) {
      // Error is already displayed inline, no need for alert
      return;
    }

    // Validate username with Zod schema
    const usernameValidation = validate(usernameSchema, username);
    if (!usernameValidation.success) {
      const errors = getValidationErrors(usernameValidation.errors);
      setUsernameError(errors[0] || "Please enter a valid username");
      return;
    }

    // Sanitize inputs before saving
    const sanitizedUsername = sanitizeUsername(username);

    setIsSaving(true);
    logger.info("Settings", "Starting save", {
      sanitizedUsername,
      isAuthenticated,
      profileId: profile?.id,
      isSupabaseConfigured
    });

    try {
      // Update Supabase profile if authenticated
      if (isAuthenticated && profile?.id && isSupabaseConfigured) {
        logger.info("Settings", "Saving to Supabase", { profileId: profile.id });

        // Check if username is unique (only if username changed)
        if (sanitizedUsername !== profile.username) {
          const { data: existingUser, error: checkError } = await supabase
            .from("profiles")
            .select("id")
            .eq("username", sanitizedUsername)
            .neq("id", profile.id)
            .maybeSingle();

          if (checkError) {
            logger.error("Settings", "Error checking username uniqueness", { error: checkError.message });
          }

          if (existingUser) {
            setUsernameError("This username is already taken");
            setIsSaving(false);
            return;
          }
        }

        // Update profile in Supabase using RPC function to bypass RLS issues
        const { error, data } = await supabase
          .rpc("update_user_profile", {
            p_profile_id: profile.id,
            p_username: sanitizedUsername,
            p_profile_picture_url: profilePicture,
          });

        // Check if RPC function doesn't exist - fallback to direct update
        const rpcNotFound = error && (
          error.code === "PGRST202" ||
          error.code === "42883" ||
          error.message?.includes("Could not find the function") ||
          error.message?.includes("not found")
        );

        if (error && !rpcNotFound) {
          logger.error("Settings", "Failed to update profile in Supabase", { error: error.message, code: error.code });
          if (error.message?.includes("Username already taken")) {
            setUsernameError("This username is already taken");
          } else {
            Alert.alert("Error", "Failed to save username. Please try again.");
          }
          setIsSaving(false);
          return;
        }

        // If RPC function doesn't exist, fall back to direct update
        if (rpcNotFound) {
          logger.info("Settings", "RPC function not available, trying direct update");
          const { error: directError, data: directData } = await supabase
            .from("profiles")
            .update({
              username: sanitizedUsername,
              profile_picture_url: profilePicture,
              country: country,
              updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id)
            .select();

          if (directError) {
            logger.error("Settings", "Direct update also failed", { error: directError.message });
            Alert.alert("Error", "Failed to save username. Please try again.");
            setIsSaving(false);
            return;
          }

          if (!directData || directData.length === 0) {
            logger.error("Settings", "Direct update returned no data - RLS blocking", { profileId: profile.id });
            Alert.alert("Error", "Unable to update username. Please run the database migration to fix permissions.");
            setIsSaving(false);
            return;
          }

          logger.info("Settings", "Profile updated via direct update", { username: sanitizedUsername, data: directData });
        } else {
          // RPC succeeded but doesn't include country, so update it separately
          const { error: countryError } = await supabase
            .from("profiles")
            .update({ country: country })
            .eq("id", profile.id);

          if (countryError) {
            logger.warn("Settings", "Failed to update country", { error: countryError.message });
          }
        }

        logger.info("Settings", "Profile updated in Supabase", { username: sanitizedUsername, profileId: profile.id, country });

        // Update userStore so the main menu reflects the change immediately
        useUserStore.getState().updateProfile({ username: sanitizedUsername });

        // Refresh AuthContext profile to keep it in sync
        try {
          await refreshProfile();
          logger.info("Settings", "AuthContext profile refreshed");
        } catch (refreshError) {
          logger.error("Settings", "Error refreshing profile", { error: refreshError instanceof Error ? refreshError.message : String(refreshError) });
          // Don't fail the save if refresh fails - data is already saved
        }
      } else {
        logger.warn("Settings", "Skipping Supabase update", {
          isAuthenticated,
          hasProfileId: !!profile?.id,
          isSupabaseConfigured
        });
      }

      // Update local AppContext as well
      updateProfile({
        username: sanitizedUsername,
        email: authUser?.email || email,
        country,
        language,
        profilePicture,
        gameSettings: {
          boardTheme,
          pieceStyle,
          soundEffects,
          vibration,
        },
      });

      logger.info("Settings", "Profile updated locally", { username: sanitizedUsername });

      Alert.alert(t("success"), t("saveChanges"), [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      logger.error("Settings", "Error saving profile", { error: error instanceof Error ? error.message : String(error) });
      Alert.alert("Error", "Failed to save changes. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSelectCountry = (selectedCountry: string) => {
    setCountry(selectedCountry);
    setShowCountryModal(false);
    setCountrySearch("");
  };

  const handleChangeAvatar = () => {
    setShowAvatarModal(true);
  };

  const handleSelectAvatar = (avatarUrl: string, index: number) => {
    // Baby dragons (0-8) are always unlocked
    const isBabyDragon = index >= 0 && index < TEENAGE_DRAGON_START_INDEX;
    const isLockedDragon = !isBabyDragon && index >= 0;

    // Check if this dragon is locked via the rewards system
    if (isLockedDragon && isAuthenticated) {
      const unlocked = isAvatarUnlocked(avatarUrl);
      if (!unlocked) {
        const hint = getUnlockHint(avatarUrl);
        Alert.alert(
          "Avatar Locked",
          hint || "Keep playing to unlock this dragon avatar!",
          [{ text: "OK" }]
        );
        return;
      }
    }

    // Fallback for non-authenticated: use local unlockedAvatars
    if (isLockedDragon && !isAuthenticated) {
      const isTeenageDragon = index >= TEENAGE_DRAGON_START_INDEX && index <= TEENAGE_DRAGON_END_INDEX;
      const isNonFierceAdult = index >= NON_FIERCE_ADULT_START_INDEX && index <= NON_FIERCE_ADULT_END_INDEX;
      const isFierceAdult = index >= FIERCE_ADULT_START_INDEX && index <= FIERCE_ADULT_END_INDEX;

      if ((isTeenageDragon || isNonFierceAdult || isFierceAdult) && !user.unlockedAvatars.includes(avatarUrl)) {
        Alert.alert(
          "Avatar Locked",
          "Sign in and complete milestones to unlock dragon avatars!",
          [{ text: "OK" }]
        );
        return;
      }
    }

    setProfilePicture(avatarUrl);
    setShowAvatarModal(false);
  };

  const handleGenerateTeenageDragon = async () => {
    if (!generatedDragon) return;
    if (user.totalWins < 10) {
      Alert.alert(
        "Feature Locked",
        "Win 10 games to unlock the ability to generate a teenage version of your unique dragon!",
        [{ text: "OK" }]
      );
      return;
    }

    if (generatedTeenageDragon) {
      Alert.alert(
        "Already Generated",
        "You've already generated a teenage version of your unique dragon! You can find it in the avatar selection.",
        [{ text: "OK" }]
      );
      return;
    }

    Alert.alert(
      "Generate Teenage Dragon?",
      "This will create a teenage version of your unique multicoloured dragon. Are you ready to see your dragon grow up?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          onPress: async () => {
            setIsGeneratingTeenageDragon(true);
            try {
              const response = await fetch(
                "https://toolkit.rork.com/images/edit/",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    prompt: "Transform this baby dragon into a teenage dragon character with a plain black or white background. Keep the same colors and style but make it more mature, slightly larger proportions, more defined features, and a bit more confident posture. This is a teenage version of the same dragon.",
                    images: [
                      {
                        type: "image",
                        image: generatedDragon,
                      },
                    ],
                    aspectRatio: "1:1",
                  }),
                }
              );

              if (!response.ok) {
                throw new Error("Failed to generate teenage dragon");
              }

              const data = await response.json();
              const teenageDragonUrl = `data:${data.image.mimeType};base64,${data.image.base64Data}`;

              await saveGeneratedTeenageDragon(teenageDragonUrl);

              // Also save to Supabase so other users can see it on leaderboard
              if (profile?.id) {
                try {
                  await supabase
                    .from("profiles")
                    .update({ profile_picture_url: teenageDragonUrl })
                    .eq("id", profile.id);
                  console.log("[Settings] Saved teenage dragon to Supabase");
                } catch (e) {
                  console.warn("[Settings] Failed to save teenage dragon to Supabase:", e);
                }
              }

              Alert.alert(
                "Success!",
                "Your unique teenage dragon has been generated and added to your avatar collection!",
                [{ text: "OK" }]
              );
            } catch (error) {
              console.error("Failed to generate teenage dragon:", error);
              Alert.alert(
                "Error",
                "Failed to generate teenage dragon. Please try again later.",
                [{ text: "OK" }]
              );
            } finally {
              setIsGeneratingTeenageDragon(false);
            }
          },
        },
      ]
    );
  };

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
            } catch (error) {
              Alert.alert("Error", "Failed to log out. Please try again.");
            }
          },
        },
      ]
    );
  };

  return (
    <LinearGradient colors={["#0F0F1E", "#1A1A2E"]} style={styles.container}>
      {/* Header with back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, settingsTab === "user" && styles.activeTab]}
          onPress={() => setSettingsTab("user")}
        >
          <Text style={[styles.tabText, settingsTab === "user" && styles.activeTabText]}>
            User Settings
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, settingsTab === "game" && styles.activeTab]}
          onPress={() => setSettingsTab("game")}
        >
          <Text style={[styles.tabText, settingsTab === "game" && styles.activeTabText]}>
            Game Settings
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor="#FFD700"
            colors={["#FFD700"]}
          />
        }
      >
        <View style={styles.content}>
          {settingsTab === "user" && (
            <>
          <View style={styles.avatarSection}>
            <Image source={{ uri: profilePicture }} style={styles.avatar} />
            <TouchableOpacity
              style={styles.changeAvatarButton}
              onPress={handleChangeAvatar}
            >
              <Camera size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("username")}</Text>
              <TextInput
                style={[styles.input, usernameError && styles.inputError]}
                value={username}
                onChangeText={handleUsernameChange}
                placeholder="Enter username"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {isCheckingUsername && (
                <View style={styles.usernameCheckingContainer}>
                  <ActivityIndicator size="small" color="#FFD700" />
                  <Text style={styles.usernameCheckingText}>Checking availability...</Text>
                </View>
              )}
              {usernameError && !isCheckingUsername && (
                <Text style={styles.usernameErrorText}>{usernameError}</Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("email")}</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.inputDisabledText}>
                  {authUser?.email || profile?.email || email || "Not set"}
                </Text>
              </View>
              {isAuthenticated && (
                <Text style={styles.inputHelperText}>
                  Email is linked to your account and cannot be changed
                </Text>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("country")}</Text>
              <TouchableOpacity
                style={styles.countrySelector}
                onPress={() => setShowCountryModal(true)}
              >
                <Text style={styles.countrySelectorText}>{country}</Text>
                <ChevronDown size={20} color="#A0A0A0" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>{t("language")}</Text>
              <TouchableOpacity
                style={styles.countrySelector}
                onPress={() => setShowLanguageModal(true)}
              >
                <Text style={styles.countrySelectorText}>{language}</Text>
                <ChevronDown size={20} color="#A0A0A0" />
              </TouchableOpacity>
            </View>

            <View style={styles.statsSection}>
              <Text style={styles.statsTitle}>{t("accountStats")}</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{userStoreProfile?.gamesWon ?? 0}</Text>
                  <Text style={styles.statLabel}>{t("totalWins")}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{userStoreProfile?.gamesLost ?? 0}</Text>
                  <Text style={styles.statLabel}>{t("totalLosses")}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>
                    {userStoreProfile?.gamesPlayed ?? 0}
                  </Text>
                  <Text style={styles.statLabel}>{t("totalGamesPlayed")}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{userStoreProfile?.gamesDrawn ?? 0}</Text>
                  <Text style={styles.statLabel}>{t("totalDraws")}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{userStoreProfile?.eloRating ?? 1200}</Text>
                  <Text style={styles.statLabel}>{t("eloRating")}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>
                    ${(((userStoreProfile?.totalWonTct ?? 0) - (userStoreProfile?.totalLostTct ?? 0)) / 25).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.statLabel}>{t("totalEarnings")}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{userStoreProfile?.currentStreak ?? 0}</Text>
                  <Text style={styles.statLabel}>{t("currentStreak")}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{userStoreProfile?.longestStreak ?? 0}</Text>
                  <Text style={styles.statLabel}>{t("longestStreak")}</Text>
                </View>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.contactSupportButton}
            onPress={() => router.push("/support")}
          >
            <View style={styles.contactSupportInner}>
              <MessageCircle size={20} color="#4ECDC4" />
              <Text style={styles.contactSupportButtonText}>Contact Support</Text>
            </View>
            {unreadSupportCount > 0 && (
              <View style={styles.supportBadge}>
                <Text style={styles.supportBadgeText}>{unreadSupportCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {isAuthenticated && (
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
            >
              <LogOut size={20} color="#FF453A" />
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </TouchableOpacity>
          )}
            </>
          )}

          {settingsTab === "game" && (
            <View style={styles.gameSettingsSection}>
              <View style={styles.gameSettingCard}>
                <Text style={styles.gameSettingTitle}>Board Theme</Text>
                <View style={styles.themeGrid}>
                  <TouchableOpacity
                    style={[
                      styles.themeOption,
                      boardTheme === "purple" && styles.themeOptionSelected,
                    ]}
                    onPress={() => setBoardTheme("purple")}
                  >
                    <View style={styles.themePreview}>
                      <View style={[styles.themeSquare, { backgroundColor: "#9B7EC8" }]} />
                      <View style={[styles.themeSquare, { backgroundColor: "#FFFFFF" }]} />
                    </View>
                    <Text style={styles.themeLabel}>Original - Purple & White</Text>
                    {boardTheme === "purple" && (
                      <View style={styles.checkMark}>
                        <Check size={16} color="#FFD700" />
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.themeOption,
                      boardTheme === "classic" && styles.themeOptionSelected,
                    ]}
                    onPress={() => setBoardTheme("classic")}
                  >
                    <View style={styles.themePreview}>
                      <View style={[styles.themeSquare, { backgroundColor: "#000000" }]} />
                      <View style={[styles.themeSquare, { backgroundColor: "#FFFFFF" }]} />
                    </View>
                    <Text style={styles.themeLabel}>Classic - Black & White</Text>
                    {boardTheme === "classic" && (
                      <View style={styles.checkMark}>
                        <Check size={16} color="#FFD700" />
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.themeOption,
                      boardTheme === "eco" && styles.themeOptionSelected,
                    ]}
                    onPress={() => setBoardTheme("eco")}
                  >
                    <View style={styles.themePreview}>
                      <View style={[styles.themeSquare, { backgroundColor: "#6B8E23" }]} />
                      <View style={[styles.themeSquare, { backgroundColor: "#8B4513" }]} />
                    </View>
                    <Text style={styles.themeLabel}>Eco - Green & Brown</Text>
                    {boardTheme === "eco" && (
                      <View style={styles.checkMark}>
                        <Check size={16} color="#FFD700" />
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.themeOption,
                      boardTheme === "retro" && styles.themeOptionSelected,
                    ]}
                    onPress={() => setBoardTheme("retro")}
                  >
                    <View style={styles.themePreview}>
                      <View style={[styles.themeSquare, { backgroundColor: "#A67C52" }]} />
                      <View style={[styles.themeSquare, { backgroundColor: "#E8D7B8" }]} />
                    </View>
                    <Text style={styles.themeLabel}>Retro - Brown & Yellow</Text>
                    {boardTheme === "retro" && (
                      <View style={styles.checkMark}>
                        <Check size={16} color="#FFD700" />
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.gameSettingCard}>
                <Text style={styles.gameSettingTitle}>Piece Style</Text>
                <View style={styles.pieceStyleGrid}>
                  <TouchableOpacity
                    style={[
                      styles.pieceStyleOption,
                      pieceStyle === "classic" && styles.pieceStyleOptionSelected,
                    ]}
                    onPress={() => setPieceStyle("classic")}
                  >
                    <View style={styles.piecePreviewRow}>
                      <ChessPieceComponent type="k" color="w" size={50} style="classic" />
                      <ChessPieceComponent type="q" color="w" size={50} style="classic" />
                      <ChessPieceComponent type="r" color="b" size={50} style="classic" />
                      <ChessPieceComponent type="n" color="b" size={50} style="classic" />
                    </View>
                    <Text style={styles.pieceStyleLabel}>Classic</Text>
                    {pieceStyle === "classic" && (
                      <View style={styles.checkMark}>
                        <Check size={16} color="#FFD700" />
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.pieceStyleOption,
                      pieceStyle === "unity" && styles.pieceStyleOptionSelected,
                    ]}
                    onPress={() => setPieceStyle("unity")}
                  >
                    <View style={styles.piecePreviewRow}>
                      <ChessPieceComponent type="k" color="w" size={50} style="unity" />
                      <ChessPieceComponent type="q" color="w" size={50} style="unity" />
                      <ChessPieceComponent type="r" color="b" size={50} style="unity" />
                      <ChessPieceComponent type="n" color="b" size={50} style="unity" />
                    </View>
                    <Text style={styles.pieceStyleLabel}>Classic 3D</Text>
                    {pieceStyle === "unity" && (
                      <View style={styles.checkMark}>
                        <Check size={16} color="#FFD700" />
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.gameSettingCard}>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text style={styles.gameSettingTitle}>Sound Effects</Text>
                    <Text style={styles.gameSettingDescription}>
                      Click sounds on moves, sword slash on checkmate, victory melody on win
                    </Text>
                  </View>
                  <Switch
                    value={soundEffects}
                    onValueChange={setSoundEffects}
                    trackColor={{ false: "#333", true: "#FFD700" }}
                    thumbColor={soundEffects ? "#FFA500" : "#666"}
                  />
                </View>
              </View>

              <View style={styles.gameSettingCard}>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text style={styles.gameSettingTitle}>Vibration</Text>
                    <Text style={styles.gameSettingDescription}>
                      Short burst on moves, long vibration from checkmate to game end
                    </Text>
                  </View>
                  <Switch
                    value={vibration}
                    onValueChange={setVibration}
                    trackColor={{ false: "#333", true: "#FFD700" }}
                    thumbColor={vibration ? "#FFA500" : "#666"}
                  />
                </View>
              </View>

              {/* 3D Board Settings Section */}
              <Chess3DSettings />
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={() => {
            console.log("[Settings] Save button pressed", { isSaving, usernameError, isCheckingUsername });
            handleSave();
          }}
          disabled={isSaving || !!usernameError || isCheckingUsername}
        >
          <LinearGradient
            colors={(isSaving || !!usernameError || isCheckingUsername) ? ["#888", "#666"] : ["#FFD700", "#FFA500"]}
            style={styles.saveButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#0F0F1E" />
            ) : (
              <Save size={20} color="#0F0F1E" />
            )}
            <Text style={styles.saveButtonText}>{isSaving ? "Saving..." : t("saveChanges")}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showCountryModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCountryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("country")}</Text>
              <TouchableOpacity onPress={() => setShowCountryModal(false)}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Search size={20} color="#A0A0A0" />
              <TextInput
                style={styles.searchInput}
                placeholder={t("search")}
                placeholderTextColor="#666"
                value={countrySearch}
                onChangeText={setCountrySearch}
              />
            </View>

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.countryItem}
                  onPress={() => handleSelectCountry(item)}
                >
                  <Text
                    style={[
                      styles.countryItemText,
                      item === country && styles.countryItemTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showLanguageModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("language")}</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.countryItem}
                  onPress={() => {
                    setLanguage(item);
                    setShowLanguageModal(false);
                  }}
                >
                  <Text
                    style={[
                      styles.countryItemText,
                      item === language && styles.countryItemTextSelected,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAvatarModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Dragon Avatar</Text>
              <TouchableOpacity onPress={() => setShowAvatarModal(false)}>
                <X size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.avatarGrid}>
                {generatedDragon && (
                  <TouchableOpacity
                    key="generated-dragon"
                    style={[
                      styles.avatarOption,
                      profilePicture === generatedDragon && styles.avatarOptionSelected,
                      (user.totalWins >= 10 && !generatedTeenageDragon) && styles.avatarOptionHighlight,
                    ]}
                    onPress={() => {
                      if (user.totalWins >= 10 && !generatedTeenageDragon && !isGeneratingTeenageDragon) {
                        handleGenerateTeenageDragon();
                      } else if (!isGeneratingTeenageDragon) {
                        handleSelectAvatar(generatedDragon, -1);
                      }
                    }}
                    onLongPress={() => handleSelectAvatar(generatedDragon, -1)}
                    disabled={isGeneratingTeenageDragon}
                  >
                    <Image source={{ uri: generatedDragon }} style={styles.avatarOptionImage} />
                    {isGeneratingTeenageDragon && (
                      <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#FFD700" />
                        <Text style={styles.loadingText}>Generating...</Text>
                      </View>
                    )}
                    {profilePicture === generatedDragon && (
                      <View style={styles.selectedBadge}>
                        <Check size={16} color="#0F0F1E" />
                      </View>
                    )}
                    <View style={styles.uniqueBadge}>
                      <Text style={styles.uniqueBadgeText}>UNIQUE BABY</Text>
                    </View>
                    {user.totalWins >= 10 && !generatedTeenageDragon && (
                      <View style={styles.generateBadge}>
                        <Text style={styles.generateBadgeText}>TAP TO EVOLVE</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                {generatedTeenageDragon && (
                  <TouchableOpacity
                    key="generated-teenage-dragon"
                    style={[
                      styles.avatarOption,
                      profilePicture === generatedTeenageDragon && styles.avatarOptionSelected,
                    ]}
                    onPress={() => handleSelectAvatar(generatedTeenageDragon, -2)}
                  >
                    <Image source={{ uri: generatedTeenageDragon }} style={styles.avatarOptionImage} />
                    {profilePicture === generatedTeenageDragon && (
                      <View style={styles.selectedBadge}>
                        <Check size={16} color="#0F0F1E" />
                      </View>
                    )}
                    <View style={styles.uniqueBadge}>
                      <Text style={styles.uniqueBadgeText}>UNIQUE TEEN</Text>
                    </View>
                  </TouchableOpacity>
                )}
                {DRAGON_AVATARS.map((avatarUrl, index) => {
                  const isBabyDragon = index < TEENAGE_DRAGON_START_INDEX;

                  // Baby dragons always unlocked; others check rewards system or fallback
                  let isLocked = false;
                  if (!isBabyDragon) {
                    if (isAuthenticated) {
                      isLocked = !isAvatarUnlocked(avatarUrl);
                    } else {
                      isLocked = !user.unlockedAvatars.includes(avatarUrl);
                    }
                  }

                  const hint = isLocked ? getUnlockHint(avatarUrl) : null;

                  return (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.avatarOption,
                        profilePicture === avatarUrl && styles.avatarOptionSelected,
                        isLocked && styles.avatarOptionLocked,
                      ]}
                      onPress={() => handleSelectAvatar(avatarUrl, index)}
                    >
                      <Image
                        source={{ uri: avatarUrl }}
                        style={[
                          styles.avatarOptionImage,
                          isLocked && styles.avatarOptionImageLocked,
                        ]}
                      />
                      {isLocked && (
                        <View style={styles.lockedOverlay}>
                          <Lock size={24} color="#FFD700" />
                          {hint && (
                            <Text style={styles.lockedHintText} numberOfLines={2}>
                              {hint}
                            </Text>
                          )}
                        </View>
                      )}
                      {profilePicture === avatarUrl && !isLocked && (
                        <View style={styles.selectedBadge}>
                          <Check size={16} color="#0F0F1E" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  avatarSection: {
    alignItems: "center",
    marginTop: 20,
    marginBottom: 40,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: "#FFD700",
  },
  changeAvatarButton: {
    position: "absolute",
    bottom: 0,
    right: "50%" as const,
    marginRight: -70,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#0F0F1E",
  },
  formSection: {
    gap: 24,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#A0A0A0",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  inputDisabled: {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    borderColor: "rgba(255, 255, 255, 0.05)",
  },
  inputDisabledText: {
    fontSize: 16,
    color: "#A0A0A0",
  },
  inputHelperText: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic" as const,
  },
  inputError: {
    borderColor: "#FF453A",
    borderWidth: 1,
  },
  usernameErrorText: {
    fontSize: 13,
    color: "#FF453A",
    marginTop: 6,
  },
  usernameCheckingContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginTop: 6,
    gap: 8,
  },
  usernameCheckingText: {
    fontSize: 13,
    color: "#FFD700",
  },
  statsSection: {
    marginTop: 16,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statBox: {
    width: "48%" as const,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800" as const,
    color: "#FFD700",
  },
  statLabel: {
    fontSize: 12,
    color: "#A0A0A0",
    marginTop: 4,
  },
  footer: {
    padding: 20,
    paddingBottom: 32,
  },
  saveButton: {
    borderRadius: 12,
    overflow: "hidden",
  },
  saveButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#0F0F1E",
  },
  countrySelector: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  countrySelectorText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1A1A2E",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%" as const,
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    margin: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: "#FFFFFF",
    paddingVertical: 12,
  },
  countryItem: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)",
  },
  countryItemText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  countryItemTextSelected: {
    color: "#FFD700",
    fontWeight: "700" as const,
  },
  avatarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 20,
    gap: 16,
    justifyContent: "space-between",
  },
  avatarOption: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
  },
  avatarOptionSelected: {
    borderColor: "#FFD700",
    borderWidth: 4,
  },
  avatarOptionImage: {
    width: "100%",
    height: "100%",
  },
  selectedBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  activeTab: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "#FFD700",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: "#A0A0A0",
  },
  activeTabText: {
    color: "#FFD700",
    fontWeight: "700" as const,
  },
  gameSettingsSection: {
    gap: 20,
    marginTop: 20,
  },
  gameSettingCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  gameSettingTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 16,
  },
  gameSettingDescription: {
    fontSize: 13,
    color: "#A0A0A0",
    marginTop: 4,
    lineHeight: 18,
  },
  themeGrid: {
    gap: 12,
  },
  themeOption: {
    width: "100%" as const,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
  },
  themeOptionSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
  },
  themePreview: {
    flexDirection: "row",
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 8,
  },
  themeSquare: {
    flex: 1,
  },
  themeLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#FFFFFF",
    textAlign: "center",
  },
  checkMark: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#0F0F1E",
    justifyContent: "center",
    alignItems: "center",
  },
  optionButtons: {
    flexDirection: "row",
    gap: 10,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  optionButtonSelected: {
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderColor: "#FFD700",
  },
  optionButtonText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#A0A0A0",
  },
  optionButtonTextSelected: {
    color: "#FFD700",
    fontWeight: "700" as const,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  switchInfo: {
    flex: 1,
  },
  pieceStyleGrid: {
    gap: 12,
  },
  pieceStyleOption: {
    width: "100%" as const,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
  },
  pieceStyleOptionSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
  },
  piecePreviewRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    height: 60,
  },
  pieceStyleLabel: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    textAlign: "center",
  },
  contactSupportButton: {
    marginTop: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(78, 205, 196, 0.3)",
  },
  contactSupportInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contactSupportButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#4ECDC4",
  },
  supportBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#FF453A",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  supportBadgeText: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: "#FFFFFF",
  },
  logoutButton: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(255, 69, 58, 0.1)",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 69, 58, 0.3)",
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: "#FF453A",
  },
  uniqueBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    right: 4,
    backgroundColor: "rgba(255, 215, 0, 0.9)",
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
    alignItems: "center",
  },
  uniqueBadgeText: {
    fontSize: 10,
    fontWeight: "700" as const,
    color: "#0F0F1E",
    letterSpacing: 0.5,
  },
  avatarOptionLocked: {
    opacity: 0.6,
  },
  avatarOptionImageLocked: {
    opacity: 0.3,
  },
  lockedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 4,
  },
  lockedHintText: {
    fontSize: 8,
    fontWeight: "600" as const,
    color: "#FFD700",
    textAlign: "center" as const,
    marginTop: 2,
  },
  avatarOptionHighlight: {
    borderColor: "#00FF88",
    borderWidth: 4,
  },
  generateBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    right: 4,
    backgroundColor: "rgba(0, 255, 136, 0.95)",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRadius: 4,
    alignItems: "center",
  },
  generateBadgeText: {
    fontSize: 9,
    fontWeight: "700" as const,
    color: "#0F0F1E",
    letterSpacing: 0.5,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    gap: 8,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: "600" as const,
    color: "#FFD700",
    marginTop: 4,
  },
  // 3D Settings Styles
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 24,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  sectionHeaderText: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#FFD700",
  },
  settingTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  qualityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  qualityOption: {
    width: "48%" as const,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
  },
  qualityOptionSelected: {
    borderColor: "#4ECDC4",
    backgroundColor: "rgba(78, 205, 196, 0.1)",
  },
  qualityLabel: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  qualityLabelSelected: {
    color: "#4ECDC4",
  },
  qualityDescription: {
    fontSize: 11,
    color: "#A0A0A0",
  },
  qualityCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#4ECDC4",
    justifyContent: "center",
    alignItems: "center",
  },
  theme3DGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  theme3DOption: {
    width: "31%" as const,
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    padding: 8,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
    alignItems: "center",
  },
  theme3DOptionSelected: {
    borderColor: "#FFD700",
    backgroundColor: "rgba(255, 215, 0, 0.1)",
  },
  theme3DOptionLocked: {
    opacity: 0.6,
  },
  theme3DPreview: {
    flexDirection: "row",
    width: "100%",
    height: 40,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 6,
  },
  theme3DSquare: {
    flex: 1,
  },
  theme3DLabel: {
    fontSize: 10,
    fontWeight: "600" as const,
    color: "#FFFFFF",
    textAlign: "center",
  },
  theme3DCheck: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFD700",
    justifyContent: "center",
    alignItems: "center",
  },
  premiumBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  effectsGrid: {
    gap: 8,
    marginTop: 8,
  },
  effectOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  effectOptionEnabled: {
    borderColor: "rgba(255, 215, 0, 0.3)",
    backgroundColor: "rgba(255, 215, 0, 0.05)",
  },
  effectLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: "#FFFFFF",
  },
});
