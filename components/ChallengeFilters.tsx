/**
 * ChallengeFilters Component
 *
 * Elite-level filter UI for the challenge board featuring:
 * - Time control category filter (bullet/blitz/rapid/classical)
 * - Wager range filter
 * - ELO range filter
 * - Username search
 * - Rated/unrated toggle
 * - Collapsible filter panel
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import {
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  Clock,
  DollarSign,
  TrendingUp,
  Search,
  Check,
} from "lucide-react-native";
import {
  ChallengeFilters as ChallengeFiltersType,
  CHALLENGE_FILTER_OPTIONS,
} from "@/lib/challenges";

// Enable LayoutAnimation on Android
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ChallengeFiltersProps {
  filters: ChallengeFiltersType;
  onFiltersChange: (filters: ChallengeFiltersType) => void;
  onClear: () => void;
  activeFilterCount: number;
}

type TimeCategory = "bullet" | "blitz" | "rapid" | "classical";

export function ChallengeFiltersComponent({
  filters,
  onFiltersChange,
  onClear,
  activeFilterCount,
}: ChallengeFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const handleTimeCategoryChange = useCallback(
    (category: TimeCategory | undefined) => {
      onFiltersChange({
        ...filters,
        timeCategory: filters.timeCategory === category ? undefined : category,
      });
    },
    [filters, onFiltersChange]
  );

  const handleWagerRangeChange = useCallback(
    (min: number | undefined, max: number | undefined) => {
      const isCurrentlySelected =
        filters.minWager === min && filters.maxWager === max;
      onFiltersChange({
        ...filters,
        minWager: isCurrentlySelected ? undefined : min,
        maxWager: isCurrentlySelected ? undefined : max,
      });
    },
    [filters, onFiltersChange]
  );

  const handleEloRangeChange = useCallback(
    (min: number | undefined, max: number | undefined) => {
      const isCurrentlySelected =
        filters.minElo === min && filters.maxElo === max;
      onFiltersChange({
        ...filters,
        minElo: isCurrentlySelected ? undefined : min,
        maxElo: isCurrentlySelected ? undefined : max,
      });
    },
    [filters, onFiltersChange]
  );

  const handleUsernameChange = useCallback(
    (text: string) => {
      onFiltersChange({
        ...filters,
        usernameSearch: text || undefined,
      });
    },
    [filters, onFiltersChange]
  );

  const handleRatedToggle = useCallback(() => {
    onFiltersChange({
      ...filters,
      isRated: filters.isRated === undefined ? true : filters.isRated === true ? false : undefined,
    });
  }, [filters, onFiltersChange]);

  return (
    <View style={styles.container}>
      {/* Filter Header - Always Visible */}
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Filter size={18} color="#FFD700" />
          <Text style={styles.headerTitle}>Filters</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountText}>{activeFilterCount}</Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {activeFilterCount > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              onPress={onClear}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={14} color="#EF4444" />
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          )}
          {isExpanded ? (
            <ChevronUp size={20} color="#A0A0A0" />
          ) : (
            <ChevronDown size={20} color="#A0A0A0" />
          )}
        </View>
      </TouchableOpacity>

      {/* Expanded Filter Content */}
      {isExpanded && (
        <View style={styles.content}>
          {/* Username Search */}
          <View style={styles.filterSection}>
            <View style={styles.sectionHeader}>
              <Search size={14} color="#A0A0A0" />
              <Text style={styles.sectionTitle}>Search Player</Text>
            </View>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Enter username..."
                placeholderTextColor="#666"
                value={filters.usernameSearch || ""}
                onChangeText={handleUsernameChange}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {filters.usernameSearch && (
                <TouchableOpacity
                  style={styles.clearSearchButton}
                  onPress={() => handleUsernameChange("")}
                >
                  <X size={16} color="#A0A0A0" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Time Control Filter */}
          <View style={styles.filterSection}>
            <View style={styles.sectionHeader}>
              <Clock size={14} color="#A0A0A0" />
              <Text style={styles.sectionTitle}>Time Control</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipContainer}
            >
              {CHALLENGE_FILTER_OPTIONS.timeCategories.map((category) => {
                const isSelected = filters.timeCategory === category.value;
                return (
                  <TouchableOpacity
                    key={category.value}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() =>
                      handleTimeCategoryChange(category.value as TimeCategory)
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                      ]}
                    >
                      {category.label}
                    </Text>
                    <Text
                      style={[
                        styles.chipSubtext,
                        isSelected && styles.chipSubtextSelected,
                      ]}
                    >
                      {category.description}
                    </Text>
                    {isSelected && (
                      <View style={styles.chipCheck}>
                        <Check size={12} color="#0F0F1E" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Wager Range Filter */}
          <View style={styles.filterSection}>
            <View style={styles.sectionHeader}>
              <DollarSign size={14} color="#A0A0A0" />
              <Text style={styles.sectionTitle}>Wager Range</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipContainer}
            >
              {CHALLENGE_FILTER_OPTIONS.wagerRanges.map((range, index) => {
                const isSelected =
                  filters.minWager === range.min &&
                  filters.maxWager === (range.max ?? undefined);
                return (
                  <TouchableOpacity
                    key={index}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() =>
                      handleWagerRangeChange(range.min, range.max ?? undefined)
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                      ]}
                    >
                      {range.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.chipCheck}>
                        <Check size={12} color="#0F0F1E" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* ELO Range Filter */}
          <View style={styles.filterSection}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={14} color="#A0A0A0" />
              <Text style={styles.sectionTitle}>Opponent ELO</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipContainer}
            >
              {CHALLENGE_FILTER_OPTIONS.eloRanges.map((range, index) => {
                const isSelected =
                  filters.minElo === range.min &&
                  filters.maxElo === (range.max ?? undefined);
                return (
                  <TouchableOpacity
                    key={index}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() =>
                      handleEloRangeChange(range.min, range.max ?? undefined)
                    }
                  >
                    <Text
                      style={[
                        styles.chipText,
                        isSelected && styles.chipTextSelected,
                      ]}
                    >
                      {range.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.chipCheck}>
                        <Check size={12} color="#0F0F1E" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Rated Toggle */}
          <View style={styles.filterSection}>
            <View style={styles.ratedToggleContainer}>
              <TouchableOpacity
                style={[
                  styles.ratedToggle,
                  filters.isRated === true && styles.ratedToggleSelected,
                ]}
                onPress={() =>
                  onFiltersChange({
                    ...filters,
                    isRated: filters.isRated === true ? undefined : true,
                  })
                }
              >
                <Text
                  style={[
                    styles.ratedToggleText,
                    filters.isRated === true && styles.ratedToggleTextSelected,
                  ]}
                >
                  Rated Only
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.ratedToggle,
                  filters.isRated === false && styles.ratedToggleSelected,
                ]}
                onPress={() =>
                  onFiltersChange({
                    ...filters,
                    isRated: filters.isRated === false ? undefined : false,
                  })
                }
              >
                <Text
                  style={[
                    styles.ratedToggleText,
                    filters.isRated === false && styles.ratedToggleTextSelected,
                  ]}
                >
                  Casual Only
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Quick Filter Pills (when collapsed) */}
      {!isExpanded && activeFilterCount > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickFiltersContainer}
        >
          {filters.timeCategory && (
            <View style={styles.quickFilterPill}>
              <Clock size={12} color="#FFD700" />
              <Text style={styles.quickFilterText}>
                {
                  CHALLENGE_FILTER_OPTIONS.timeCategories.find(
                    (c) => c.value === filters.timeCategory
                  )?.label
                }
              </Text>
              <TouchableOpacity
                onPress={() =>
                  onFiltersChange({ ...filters, timeCategory: undefined })
                }
              >
                <X size={12} color="#A0A0A0" />
              </TouchableOpacity>
            </View>
          )}
          {(filters.minWager !== undefined || filters.maxWager !== undefined) && (
            <View style={styles.quickFilterPill}>
              <DollarSign size={12} color="#FFD700" />
              <Text style={styles.quickFilterText}>
                {filters.minWager ?? 0}-{filters.maxWager ?? "∞"} TCT
              </Text>
              <TouchableOpacity
                onPress={() =>
                  onFiltersChange({
                    ...filters,
                    minWager: undefined,
                    maxWager: undefined,
                  })
                }
              >
                <X size={12} color="#A0A0A0" />
              </TouchableOpacity>
            </View>
          )}
          {(filters.minElo !== undefined || filters.maxElo !== undefined) && (
            <View style={styles.quickFilterPill}>
              <TrendingUp size={12} color="#FFD700" />
              <Text style={styles.quickFilterText}>
                {filters.minElo ?? 0}-{filters.maxElo ?? "∞"} ELO
              </Text>
              <TouchableOpacity
                onPress={() =>
                  onFiltersChange({
                    ...filters,
                    minElo: undefined,
                    maxElo: undefined,
                  })
                }
              >
                <X size={12} color="#A0A0A0" />
              </TouchableOpacity>
            </View>
          )}
          {filters.usernameSearch && (
            <View style={styles.quickFilterPill}>
              <Search size={12} color="#FFD700" />
              <Text style={styles.quickFilterText}>
                "{filters.usernameSearch}"
              </Text>
              <TouchableOpacity
                onPress={() =>
                  onFiltersChange({ ...filters, usernameSearch: undefined })
                }
              >
                <X size={12} color="#A0A0A0" />
              </TouchableOpacity>
            </View>
          )}
          {filters.isRated !== undefined && (
            <View style={styles.quickFilterPill}>
              <Text style={styles.quickFilterText}>
                {filters.isRated ? "Rated" : "Casual"}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  onFiltersChange({ ...filters, isRated: undefined })
                }
              >
                <X size={12} color="#A0A0A0" />
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  filterCountBadge: {
    backgroundColor: "#FFD700",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F0F1E",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  clearText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#EF4444",
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 16,
  },
  filterSection: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A0A0A0",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipContainer: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    position: "relative",
  },
  chipSelected: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  chipTextSelected: {
    color: "#FFD700",
  },
  chipSubtext: {
    fontSize: 10,
    color: "#A0A0A0",
    marginTop: 2,
  },
  chipSubtextSelected: {
    color: "rgba(255, 215, 0, 0.7)",
  },
  chipCheck: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#FFD700",
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: "#FFFFFF",
  },
  clearSearchButton: {
    padding: 12,
  },
  ratedToggleContainer: {
    flexDirection: "row",
    gap: 10,
  },
  ratedToggle: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
  },
  ratedToggleSelected: {
    backgroundColor: "rgba(255, 215, 0, 0.15)",
    borderColor: "#FFD700",
  },
  ratedToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A0A0A0",
  },
  ratedToggleTextSelected: {
    color: "#FFD700",
  },
  quickFiltersContainer: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 8,
  },
  quickFilterPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255, 215, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 215, 0, 0.3)",
  },
  quickFilterText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFD700",
  },
});

export default ChallengeFiltersComponent;
