/**
 * Jest Test Setup
 *
 * Global test configuration and mocks for the Treasure Chess test suite.
 * Sets up React Native, Expo, and Supabase mocks.
 */

// Note: @testing-library/jest-native/extend-expect removed due to ESM compatibility issues
// Custom matchers are defined below instead

// ============================================================================
// Global Mocks
// ============================================================================

// Mock react-native to prevent ESM import issues
// Full mock without requireActual to avoid ESM issues
jest.mock("react-native", () => ({
  Platform: { OS: "ios", select: jest.fn((obj: any) => obj.ios), Version: 14 },
  StyleSheet: { create: (styles: any) => styles, flatten: (style: any) => style },
  Dimensions: { get: jest.fn(() => ({ width: 375, height: 812 })), addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  PixelRatio: { get: jest.fn(() => 2), roundToNearestPixel: jest.fn((n: number) => n) },
  Alert: { alert: jest.fn() },
  Linking: { openURL: jest.fn(), canOpenURL: jest.fn(() => Promise.resolve(true)), addEventListener: jest.fn() },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: "active" },
  NativeModules: {},
  NativeEventEmitter: jest.fn(() => ({ addListener: jest.fn(), removeAllListeners: jest.fn() })),
  Animated: {
    View: "Animated.View",
    Text: "Animated.Text",
    Image: "Animated.Image",
    ScrollView: "Animated.ScrollView",
    FlatList: "Animated.FlatList",
    Value: jest.fn(() => ({
      setValue: jest.fn(),
      interpolate: jest.fn(() => ({ __getValue: jest.fn() })),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      removeAllListeners: jest.fn(),
      stopAnimation: jest.fn(),
      _value: 0,
    })),
    timing: jest.fn(() => ({ start: jest.fn((cb?: Function) => cb && cb({ finished: true })), stop: jest.fn() })),
    spring: jest.fn(() => ({ start: jest.fn((cb?: Function) => cb && cb({ finished: true })), stop: jest.fn() })),
    sequence: jest.fn(() => ({ start: jest.fn((cb?: Function) => cb && cb({ finished: true })), stop: jest.fn() })),
    parallel: jest.fn(() => ({ start: jest.fn((cb?: Function) => cb && cb({ finished: true })), stop: jest.fn() })),
    loop: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    delay: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
    event: jest.fn(),
    createAnimatedComponent: (component: any) => component,
    add: jest.fn(() => ({ interpolate: jest.fn() })),
    subtract: jest.fn(),
    multiply: jest.fn(),
    divide: jest.fn(),
  },
  Keyboard: { dismiss: jest.fn(), addListener: jest.fn(() => ({ remove: jest.fn() })) },
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  TouchableHighlight: "TouchableHighlight",
  TouchableWithoutFeedback: "TouchableWithoutFeedback",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  FlatList: "FlatList",
  SectionList: "SectionList",
  TextInput: "TextInput",
  Image: "Image",
  ImageBackground: "ImageBackground",
  ActivityIndicator: "ActivityIndicator",
  RefreshControl: "RefreshControl",
  Modal: "Modal",
  SafeAreaView: "SafeAreaView",
  StatusBar: "StatusBar",
  Switch: "Switch",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  useColorScheme: jest.fn(() => "dark"),
  useWindowDimensions: jest.fn(() => ({ width: 375, height: 812 })),
  AccessibilityInfo: { isReduceMotionEnabled: jest.fn(() => Promise.resolve(false)) },
  I18nManager: { isRTL: false },
  Easing: { linear: jest.fn(), ease: jest.fn(), bezier: jest.fn(), in: jest.fn(), out: jest.fn(), inOut: jest.fn() },
}));

// Note: We don't mock @testing-library/react-native anymore - let it use the actual implementation
// Tests that need actual hook execution (like AuthContext) can import renderHook directly

// Mock react-native-css-interop used by nativewind
jest.mock("react-native-css-interop", () => ({
  cssInterop: jest.fn(),
  remapProps: jest.fn(),
  createInteropElement: jest.fn(),
  useColorScheme: jest.fn(() => "dark"),
  vars: jest.fn(() => ({})),
}));

// Mock nativewind jsx-runtime
jest.mock("nativewind/jsx-runtime", () => ({
  jsx: jest.fn(),
  jsxs: jest.fn(),
  Fragment: "Fragment",
}));

// Mock expo-modules-core to prevent EventEmitter issues
jest.mock("expo-modules-core", () => ({
  EventEmitter: jest.fn(() => ({
    addListener: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    emit: jest.fn(),
  })),
  NativeModulesProxy: {},
  requireNativeViewManager: jest.fn(() => "View"),
}));

// Mock expo-constants
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    appOwnership: "expo",
    expoConfig: {
      version: "1.0.0",
      extra: {},
      ios: { buildNumber: "1" },
      android: { versionCode: 1 },
    },
  },
}));

// Mock Expo Router
jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
  usePathname: jest.fn(() => "/"),
  useSegments: jest.fn(() => []),
  Link: "Link",
  Stack: {
    Screen: "Screen",
  },
  Tabs: {
    Screen: "Screen",
  },
}));

// Mock Expo Haptics
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

// Mock Expo Clipboard
jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
  getStringAsync: jest.fn(() => Promise.resolve("")),
}));

// Mock Expo Location
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: "granted" })
  ),
  getForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: "granted", granted: true, canAskAgain: true })
  ),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        altitude: null,
        accuracy: 10,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    })
  ),
  reverseGeocodeAsync: jest.fn(() =>
    Promise.resolve([
      {
        country: "United States",
        isoCountryCode: "US",
        region: "California",
        subregion: "San Francisco",
        city: "San Francisco",
      },
    ])
  ),
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
  PermissionStatus: {
    UNDETERMINED: "undetermined",
    GRANTED: "granted",
    DENIED: "denied",
  },
}));

// Mock Expo Linear Gradient
jest.mock("expo-linear-gradient", () => ({
  LinearGradient: "LinearGradient",
}));

// Mock Supabase with a chainable query builder
jest.mock("@/lib/supabase", () => {
  // Create a chainable mock that supports all query methods
  const createChainableMock = () => {
    const chainable: any = {
      select: jest.fn(() => chainable),
      eq: jest.fn(() => chainable),
      neq: jest.fn(() => chainable),
      gt: jest.fn(() => chainable),
      gte: jest.fn(() => chainable),
      lt: jest.fn(() => chainable),
      lte: jest.fn(() => chainable),
      is: jest.fn(() => chainable),
      in: jest.fn(() => chainable),
      order: jest.fn(() => chainable),
      limit: jest.fn(() => chainable),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: jest.fn((resolve) => resolve({ data: [], error: null })),
    };
    return chainable;
  };

  return {
    supabase: {
      auth: {
        getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
        getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })),
        signInWithPassword: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        onAuthStateChange: jest.fn(() => ({
          data: { subscription: { unsubscribe: jest.fn() } },
        })),
      },
      from: jest.fn(() => ({
        ...createChainableMock(),
        insert: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
        update: jest.fn(() => createChainableMock()),
        delete: jest.fn(() => createChainableMock()),
      })),
      channel: jest.fn(() => ({
        on: jest.fn(function(this: any) { return this; }),
        subscribe: jest.fn(),
      })),
      removeChannel: jest.fn(),
      rpc: jest.fn(() => Promise.resolve({ data: null, error: null })),
    },
  };
});

// Mock profileSyncService globally
jest.mock("@/lib/profileSync", () => ({
  profileSyncService: {
    initialize: jest.fn().mockResolvedValue({ id: "test-profile", username: "TestUser" }),
    cleanup: jest.fn().mockResolvedValue(undefined),
    forceSyncNow: jest.fn().mockResolvedValue({ id: "test-profile", username: "TestUser" }),
    fetchBalance: jest.fn().mockResolvedValue({ availableTct: 1000, lockedTct: 0 }),
    getCurrentProfile: jest.fn().mockReturnValue({ id: "test-profile", username: "TestUser", eloRating: 1200 }),
    getCurrentCachedProfile: jest.fn().mockReturnValue({ id: "test-profile", username: "TestUser", eloRating: 1200 }),
    getSyncState: jest.fn().mockReturnValue({ status: "idle", lastSyncAt: new Date().toISOString() }),
    updateProfile: jest.fn().mockResolvedValue({ id: "test-profile", username: "TestUser" }),
    onProfileChange: jest.fn(() => jest.fn()),
    onSyncStateChange: jest.fn(() => jest.fn()),
    onEloChange: jest.fn(() => jest.fn()),
  },
  ProfileSyncService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue({ id: "test-profile", username: "TestUser" }),
    cleanup: jest.fn().mockResolvedValue(undefined),
    forceSyncNow: jest.fn().mockResolvedValue({ id: "test-profile", username: "TestUser" }),
    fetchBalance: jest.fn().mockResolvedValue({ availableTct: 1000, lockedTct: 0 }),
    getCurrentProfile: jest.fn().mockReturnValue({ id: "test-profile", username: "TestUser", eloRating: 1200 }),
    getCurrentCachedProfile: jest.fn().mockReturnValue({ id: "test-profile", username: "TestUser", eloRating: 1200 }),
    getSyncState: jest.fn().mockReturnValue({ status: "idle", lastSyncAt: new Date().toISOString() }),
    updateProfile: jest.fn().mockResolvedValue({ id: "test-profile", username: "TestUser" }),
    onProfileChange: jest.fn(() => jest.fn()),
    onSyncStateChange: jest.fn(() => jest.fn()),
    onEloChange: jest.fn(() => jest.fn()),
  })),
}));

// Mock chess.js with a proper class that won't be affected by resetMocks
jest.mock("chess.js", () => {
  class MockChess {
    move(move: string | object) {
      if (typeof move === "string") {
        if (move === "invalid") return null;
        return { san: move, from: "e2", to: "e4" };
      }
      return { san: "e4", ...move };
    }
    fen() {
      return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    }
    turn() {
      return "w";
    }
    isGameOver() {
      return false;
    }
    isCheckmate() {
      return false;
    }
    isStalemate() {
      return false;
    }
    isDraw() {
      return false;
    }
    isCheck() {
      return false;
    }
    history() {
      return [];
    }
    moves() {
      return ["e4", "d4", "Nf3", "Nc3"];
    }
    load() {
      return true;
    }
    reset() {}
    undo() {}
    pgn() {
      return "";
    }
  }
  return { Chess: MockChess };
});

// Mock lucide-react-native icons
jest.mock("lucide-react-native", () => new Proxy({}, {
  get: (_target, prop) => {
    if (typeof prop === "string") {
      return prop;
    }
    return undefined;
  },
}));

// Mock nativewind
jest.mock("nativewind", () => ({
  styled: (Component: any) => Component,
  useColorScheme: jest.fn(() => ({ colorScheme: "dark", toggleColorScheme: jest.fn() })),
}));

// Mock expo-camera (virtual mock since it may not be installed)
jest.mock("expo-camera", () => ({
  Camera: {
    requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
    requestMicrophonePermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
    getCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
    getMicrophonePermissionsAsync: jest.fn(() => Promise.resolve({ status: "granted" })),
  },
  CameraView: "CameraView",
  CameraType: {
    front: "front",
    back: "back",
  },
  useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
  useMicrophonePermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
}), { virtual: true });

// Mock expo-av (virtual mock)
jest.mock("expo-av", () => ({
  Audio: {
    setAudioModeAsync: jest.fn(),
    Recording: {
      createAsync: jest.fn(() => Promise.resolve({ recording: { stopAndUnloadAsync: jest.fn() } })),
    },
  },
  AndroidOutputFormat: { AAC_ADTS: "AAC_ADTS" },
  AndroidAudioEncoder: { AAC: "AAC" },
  IOSOutputFormat: { MPEG4AAC: "MPEG4AAC" },
  IOSAudioQuality: { HIGH: "HIGH" },
}), { virtual: true });

// Mock react-native-view-shot (virtual mock)
jest.mock("react-native-view-shot", () => ({
  captureRef: jest.fn(() => Promise.resolve("file://captured-frame.jpg")),
}), { virtual: true });

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
}));

// Mock expo-web-browser
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(() =>
    Promise.resolve({ type: "success", url: "https://app.example.com/oauth/callback?code=test-code" })
  ),
  maybeCompleteAuthSession: jest.fn(),
}));

// Mock expo-file-system (virtual mock)
jest.mock("expo-file-system", () => ({
  documentDirectory: "file:///document/",
  cacheDirectory: "file:///cache/",
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve("")),
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
}), { virtual: true });

// ============================================================================
// Global Test Utilities
// ============================================================================

// Silence console.error and console.warn in tests unless debugging
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const firstArg = args[0];
    if (
      typeof firstArg === "string" &&
      (firstArg.includes("Warning:") ||
        firstArg.includes("ReactDOM.render") ||
        firstArg.includes("act(...)"))
    ) {
      return;
    }
    originalError.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    const firstArg = args[0];
    if (typeof firstArg === "string" && firstArg.includes("Warning:")) {
      return;
    }
    originalWarn.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Clear all mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// Custom Matchers
// ============================================================================

expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// TypeScript declaration for custom matcher
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Wait for async operations to complete.
 */
export const flushPromises = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Create a mock user for testing.
 */
export const createMockUser = (overrides = {}) => ({
  id: "test-user-id",
  username: "TestPlayer",
  email: "test@example.com",
  avatar_index: 1,
  elo_rating: 1200,
  games_played: 50,
  wins: 25,
  losses: 20,
  draws: 5,
  balance_tct: 1000,
  created_at: new Date().toISOString(),
  ...overrides,
});

/**
 * Create a mock game for testing.
 */
export const createMockGame = (overrides = {}) => ({
  id: "test-game-id",
  white_player_id: "white-player-id",
  black_player_id: "black-player-id",
  status: "active",
  current_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  current_turn: "w",
  time_control_seconds: 300,
  increment_seconds: 3,
  white_time_remaining: 300,
  black_time_remaining: 300,
  wager_tct: 0,
  is_rated: true,
  move_count: 0,
  created_at: new Date().toISOString(),
  started_at: new Date().toISOString(),
  ...overrides,
});

/**
 * Create a mock challenge for testing.
 */
export const createMockChallenge = (overrides = {}) => ({
  id: "test-challenge-id",
  room_code: "ABC123",
  creator_id: "creator-id",
  opponent_id: null,
  wager_tct: 0,
  time_control_seconds: 300,
  increment_seconds: 3,
  creator_color_preference: "random",
  is_public: true,
  is_rated: true,
  status: "pending",
  game_id: null,
  expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
  accepted_at: null,
  ...overrides,
});
