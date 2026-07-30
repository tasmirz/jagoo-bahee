import { useEffect, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type GestureStateChangeEvent,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AppPalette, ThemeMode } from './tokens';
import { maxFontScale, motion, radius, spacing, type as typography } from './tokens';
import { Button } from './components';
import { FrostedSurface } from './layout';

/**
 * A real, drag-to-dismiss bottom sheet (Plan 12 §9.4 `BottomSheet`). Every sheet-shaped
 * surface in the app before this (community/community-kind pickers, action menus,
 * confirmations) was either an inline expanding form or absent — this is the shared
 * implementation everything else in the plan builds on.
 */
export function BottomSheet({
  colors,
  mode,
  visible,
  onClose,
  title,
  children,
  maxHeightRatio = 0.88,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: ReactNode;
  readonly maxHeightRatio?: number;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxHeight = height * maxHeightRatio;
  const translateY = useSharedValue(maxHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
      backdropOpacity.value = withTiming(1, { duration: motion.sheetMs });
    } else {
      translateY.value = withTiming(maxHeight, { duration: motion.sheetMs });
      backdropOpacity.value = withTiming(0, { duration: motion.sheetMs });
    }
  }, [visible, maxHeight, translateY, backdropOpacity]);

  const close = () => {
    void AccessibilityInfo.isReduceMotionEnabled();
    onClose();
  };

  const pan = Gesture.Pan()
    .onUpdate((event: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
      if (event.translationY > 0) translateY.value = event.translationY;
    })
    .onEnd((event: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => {
      if (event.translationY > 100 || event.velocityY > 800) {
        translateY.value = withTiming(maxHeight, { duration: motion.sheetMs });
        runOnJS(close)();
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 220 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, { maxHeight }, sheetStyle]}>
            <FrostedSurface
              colors={colors}
              mode={mode}
              variant="sheet"
              style={[styles.sheetSurface, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}
            >
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              {title ? (
                <View style={styles.sheetHeader}>
                  <Text
                    accessibilityRole="header"
                    maxFontSizeMultiplier={maxFontScale.h2}
                    style={[typography.h2, { color: colors.text }]}
                  >
                    {title}
                  </Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={close} style={styles.closeButton}>
                    <Ionicons name="close" size={22} color={colors.text2} />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.sheetBody}>{children}</View>
            </FrostedSurface>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

export interface ActionSheetItem {
  readonly label: string;
  readonly icon?: string;
  readonly destructive?: boolean;
  readonly onPress: () => void;
}

export function ActionSheet({
  colors,
  mode,
  visible,
  onClose,
  title,
  items,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly items: readonly ActionSheetItem[];
}) {
  return (
    <BottomSheet colors={colors} mode={mode} visible={visible} onClose={onClose} title={title} maxHeightRatio={0.6}>
      <View style={{ gap: spacing.xxs }}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={styles.actionRow}
          >
            {item.icon ? (
              <Ionicons
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                name={item.icon as any}
                size={20}
                color={item.destructive ? colors.blackout : colors.text2}
              />
            ) : null}
            <Text
              maxFontSizeMultiplier={maxFontScale.bodyLarge}
              style={[typography.bodyLarge, { color: item.destructive ? colors.blackout : colors.text }]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

export function ConfirmSheet({
  colors,
  mode,
  visible,
  onClose,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel?: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
}) {
  return (
    <BottomSheet colors={colors} mode={mode} visible={visible} onClose={onClose} title={title} maxHeightRatio={0.5}>
      <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2 }]}>
        {body}
      </Text>
      <View style={styles.confirmActions}>
        <View style={{ flex: 1 }}>
          <Button colors={colors} label="Cancel" variant="secondary" onPress={onClose} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            colors={colors}
            label={confirmLabel}
            variant={destructive ? 'destructive' : 'primary'}
            onPress={() => {
              onClose();
              onConfirm();
            }}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { width: '100%' },
  sheetSurface: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  sheetHeader: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  actionRow: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  confirmActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
