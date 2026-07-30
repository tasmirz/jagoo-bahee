import { FlatList, RefreshControl, type FlatListProps } from 'react-native';
import type { AppPalette } from './tokens';
import { spacing } from './tokens';
import { useContentInsets } from './layout';

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
    <FlatList
      data={data as T[]}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onEndReachedThreshold={0.5}
      onEndReached={onEndReached}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors?.ember}
          />
        ) : undefined
      }
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      ListEmptyComponent={ListEmptyComponent}
      contentContainerStyle={[{ paddingBottom: bottom, flexGrow: 1 }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      {...rest}
    />
  );
}

export const listGaps = { section: spacing.sm } as const;
