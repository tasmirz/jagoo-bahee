import { FlatList, Pressable, StyleSheet, Text, View, type FlatListProps } from 'react-native';
import type { AppPalette } from './tokens';
import { spacing, type as typography } from './tokens';
import { useContentInsets } from './layout';
import { WorkProgress } from './feedback';

/**
 * Root cause #7: `FeedScreen` rendered `posts.map()` inside a plain `ScrollView` at a fixed
 * `limit=25`, discarding the `nextCursor` the backend already returns. `InfiniteList` wraps
 * `FlatList` so every list in the app gets virtualization, pull-to-refresh, and an
 * `onEndReached` page fetch for free, with the correct bottom content inset from `Page`
 * instead of a flat `spacing.lg` guess.
 */
export function InfiniteList<T>({
  data,
  keyExtractor,
  renderItem,
  onEndReached,
  onRefresh,
  refreshing = false,
  colors,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  contentContainerStyle,
  ...rest
}: {
  readonly data: readonly T[];
  readonly keyExtractor: (item: T, index: number) => string;
  readonly renderItem: FlatListProps<T>['renderItem'];
  readonly onEndReached?: () => void;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  readonly colors?: AppPalette;
} & Omit<FlatListProps<T>, 'data' | 'keyExtractor' | 'renderItem' | 'onEndReached' | 'onRefresh' | 'refreshing'>) {
  const { bottom } = useContentInsets();
  return (
    <View style={styles.container}>
      {onRefresh && colors ? (
        refreshing ? (
          <View style={styles.refresh}>
            <WorkProgress colors={colors} label="Refreshing content" />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={onRefresh}
            style={styles.refreshButton}
          >
            <Text style={[typography.caption, { color: colors.text2 }]}>Refresh content</Text>
          </Pressable>
        )
      ) : null}
      <FlatList
        data={data as T[]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReachedThreshold={0.5}
        onEndReached={onEndReached}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={[{ paddingBottom: bottom, flexGrow: 1 }, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        {...rest}
      />
    </View>
  );
}

export const listGaps = { section: spacing.sm } as const;

const styles = StyleSheet.create({
  container: { flex: 1 },
  refresh: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  refreshButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
