import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { AppPalette } from './tokens';
import { maxFontScale, radius, spacing, type as typography } from './tokens';

/**
 * Shared form primitives (Plan 12 §9.4). Every screen previously hand-copied the same inline
 * style array onto a bare `TextInput` — 40+ duplications of
 * `style={[styles.input, typography.body, { backgroundColor, borderColor, color }]}` — which
 * is how `CommunityCreateScreen`'s duplicate ended up with none of it at all. One field
 * component now owns that look.
 */

export function FieldLabel({ colors, children }: { readonly colors: AppPalette; readonly children: ReactNode }) {
  return (
    <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>
      {children}
    </Text>
  );
}

export function HelperText({
  colors,
  tone = 'neutral',
  children,
}: {
  readonly colors: AppPalette;
  readonly tone?: 'neutral' | 'danger';
  readonly children: ReactNode;
}) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontScale.caption}
      style={[typography.caption, { color: tone === 'danger' ? colors.blackout : colors.text2 }]}
    >
      {children}
    </Text>
  );
}

export function CharCounter({
  colors,
  length,
  max,
}: {
  readonly colors: AppPalette;
  readonly length: number;
  readonly max: number;
}) {
  return (
    <Text
      maxFontSizeMultiplier={maxFontScale.caption}
      style={[
        typography.caption,
        { color: length > max ? colors.blackout : colors.text2, textAlign: 'right' },
      ]}
    >
      {length}/{max}
    </Text>
  );
}

interface FieldWrapProps {
  readonly colors: AppPalette;
  readonly label?: string;
  readonly hint?: string;
  readonly error?: string;
  readonly maxLength?: number;
  readonly value: string;
}

function FieldWrap({ colors, label, hint, error, maxLength, value, children }: FieldWrapProps & { children: ReactNode }) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel colors={colors}>{label}</FieldLabel> : null}
      {children}
      <View style={styles.fieldFooter}>
        <View style={{ flex: 1 }}>
          {error ? (
            <HelperText colors={colors} tone="danger">
              {error}
            </HelperText>
          ) : hint ? (
            <HelperText colors={colors}>{hint}</HelperText>
          ) : null}
        </View>
        {maxLength ? <CharCounter colors={colors} length={value.length} max={maxLength} /> : null}
      </View>
    </View>
  );
}

export function TextField({
  colors,
  label,
  hint,
  error,
  value,
  onChangeText,
  placeholder,
  maxLength,
  mono = false,
  ...rest
}: FieldWrapProps & {
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly mono?: boolean;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'placeholder' | 'style'>) {
  return (
    <FieldWrap colors={colors} label={label} hint={hint} error={error} maxLength={maxLength} value={value}>
      <TextInput
        accessibilityLabel={label ?? placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        maxLength={maxLength}
        style={[
          styles.input,
          mono ? typography.mono : typography.body,
          {
            backgroundColor: colors.surface2,
            borderColor: error ? colors.blackout : colors.border,
            color: colors.text,
          },
        ]}
        {...rest}
      />
    </FieldWrap>
  );
}

export function TextAreaField({
  colors,
  label,
  hint,
  error,
  value,
  onChangeText,
  placeholder,
  maxLength,
  minHeight = 140,
  mono = false,
}: FieldWrapProps & {
  readonly onChangeText: (value: string) => void;
  readonly placeholder?: string;
  readonly minHeight?: number;
  readonly mono?: boolean;
}) {
  return (
    <FieldWrap colors={colors} label={label} hint={hint} error={error} maxLength={maxLength} value={value}>
      <TextInput
        accessibilityLabel={label ?? placeholder}
        multiline
        textAlignVertical="top"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        maxLength={maxLength}
        style={[
          styles.input,
          { minHeight },
          mono ? typography.mono : typography.body,
          {
            backgroundColor: colors.surface2,
            borderColor: error ? colors.blackout : colors.border,
            color: colors.text,
          },
        ]}
      />
    </FieldWrap>
  );
}

export function PasswordField({
  colors,
  label,
  hint,
  error,
  value,
  onChangeText,
  placeholder,
}: FieldWrapProps & { readonly onChangeText: (value: string) => void; readonly placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <FieldWrap colors={colors} label={label} hint={hint} error={error} value={value}>
      <View style={styles.passwordRow}>
        <TextInput
          accessibilityLabel={label ?? placeholder}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.text3}
          style={[
            styles.input,
            styles.passwordInput,
            typography.body,
            { backgroundColor: colors.surface2, borderColor: error ? colors.blackout : colors.border, color: colors.text },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}
          onPress={() => setVisible((v) => !v)}
          style={styles.passwordToggle}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.text2} />
        </Pressable>
      </View>
    </FieldWrap>
  );
}

export function ToggleRow({
  colors,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly hint?: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <FieldLabel colors={colors}>{label}</FieldLabel>
        {hint ? <HelperText colors={colors}>{hint}</HelperText> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.surface2, true: colors.ember }}
        value={value}
      />
    </View>
  );
}

export function SegmentedControl<T extends string>({
  colors,
  options,
  value,
  onChange,
}: {
  readonly colors: AppPalette;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected ? { backgroundColor: colors.surface } : null]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={maxFontScale.label}
              style={[typography.label, { color: selected ? colors.text : colors.text2 }]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A wrapping chip row — the direct fix for root cause #4: the composer's community and
 * post-kind pills previously stacked one-per-line because their container had `gap` but no
 * `flexDirection: 'row'` / `flexWrap: 'wrap'`.
 */
export function ChipGroup({ children, gap = spacing.xs }: { readonly children: ReactNode; readonly gap?: number }) {
  return <View style={[styles.chipGroup, { gap }]}>{children}</View>;
}

export function SelectField({
  colors,
  label,
  value,
  placeholder,
  onPress,
  leading,
}: {
  readonly colors: AppPalette;
  readonly label?: string;
  readonly value: string | null;
  readonly placeholder: string;
  readonly onPress: () => void;
  readonly leading?: ReactNode;
}) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel colors={colors}>{label}</FieldLabel> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        onPress={onPress}
        style={[styles.select, { backgroundColor: colors.surface2, borderColor: colors.border }]}
      >
        {leading}
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={maxFontScale.bodyLarge}
          style={[typography.bodyLarge, { color: value ? colors.text : colors.text3, flex: 1 }]}
        >
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.text2} />
      </Pressable>
    </View>
  );
}

export function Disclosure({
  colors,
  title,
  children,
  defaultOpen = false,
}: {
  readonly colors: AppPalette;
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.disclosureHeader}
      >
        <Text maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>
          {title}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text2} />
      </Pressable>
      {open ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}

export function FormFooter({ children }: { readonly children: ReactNode }) {
  return <View style={styles.formFooter}>{children}</View>;
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  fieldFooter: { flexDirection: 'row', alignItems: 'center' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingRight: 44 },
  passwordToggle: {
    position: 'absolute',
    right: 4,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, gap: spacing.sm },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap' },
  select: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  disclosureHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  disclosureBody: { paddingTop: spacing.sm, gap: spacing.sm },
  formFooter: { paddingTop: spacing.sm },
});
