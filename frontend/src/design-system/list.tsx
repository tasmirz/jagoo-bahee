import { FlatList, RefreshControl, StyleSheet, View, type FlatListProps } from 'react-native';
import type { AppPalette } from './tokens';
import { spacing, useGutter } from './tokens';
import { useContentInsets } from './layout';

/**
 * Root cause #7: `FeedScreen` rendered `posts.map()` inside a plain `ScrollView` at a fixed
 * `limit=25`, discarding the `nextCursor` the backend already returns. `InfiniteList` wraps
 * `FlatList` so every list in the app gets virtualization, pull-to-refresh, and an
 * `onEndReached` page fetch for free, with the correct bottom content inset from `Page`
 * instead of a flat `spacing.lg` guess.
 *
 * Refresh is the platform gesture, not a widget. The previous version rendered a "Refresh
 * content" text button above the list and swapped it for a progress banner while fetching,
 * which pushed the first row down, stole a tap target from the content, and left the pull
 * gesture doing nothing at all — the one interaction every reader already knows. `FlatList`
 * has `RefreshControl` for exactly this, so it also gets the spinner's platform placement,
 * its accessibility semantics, and its overscroll behaviour for free.
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
  gutter = true,
  ...rest
}: {
  readonly data: readonly T[];
  readonly keyExtractor: (item: T, index: number) => string;
  readonly renderItem: FlatListProps<T>['renderItem'];
  readonly onEndReached?: () => void;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
  readonly colors?: AppPalette;
  /**
   * A list inside a `Page gutter={false}` owns the screen's inline inset, because the scroll
   * view itself has to reach the screen edge. Same number, same hook as `Page` — so rows line
   * up with the header and controls above them instead of being 16px out at every breakpoint.
   */
  readonly gutter?: boolean;
} & Omit<FlatListProps<T>, 'data' | 'keyExtractor' | 'renderItem' | 'onEndReached' | 'onRefresh' | 'refreshing'>) {
  const { bottom } = useContentInsets();
  const inline = useGutter();
  return (
    <View style={styles.container}>
      <FlatList
        data={data as T[]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReachedThreshold={0.5}
        onEndReached={onEndReached}
        ListHeaderComponent={ListHeaderComponent}
        ListFooterComponent={ListFooterComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={[
          { paddingBottom: bottom, paddingHorizontal: gutter ? inline : 0, flexGrow: 1 },
          contentContainerStyle,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              // Colour alone never carries the meaning (`CLAUDE.md` §6) — the spinner is the
              // shape, the label is the text, and the tint only matches the app.
              accessibilityLabel="Pull down to refresh"
              colors={colors ? [colors.ember] : undefined}
              tintColor={colors?.ember}
              progressBackgroundColor={colors?.surface}
            />
          ) : undefined
        }
        {...rest}
      />
    </View>
  );
}

export const listGaps = { section: spacing.sm } as const;

const styles = StyleSheet.create({
  container: { flex: 1 },
});
