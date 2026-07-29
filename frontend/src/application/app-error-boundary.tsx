import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, palettes, spacing, type as typography } from '../design-system';

interface State {
  readonly error: Error | null;
}

export class AppErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) console.error('Jagoo UI boundary', error, info.componentStack);
  }

  private readonly recover = () => this.setState({ error: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const colors = palettes.light;
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
          This screen stopped unexpectedly
        </Text>
        <Text style={[typography.body, { color: colors.text2 }]}>
          Your keys and saved acknowledgements are still on this device. Reopen the screen to try
          again.
        </Text>
        <Button colors={colors} label="Reopen screen" onPress={this.recover} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
});
