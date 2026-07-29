/**
 * The ambient reachability scope (T3.20, TP-20, TG-10).
 *
 * ── Why this is a context, when nothing else in the design system is ────────────────
 * TP-20: "The client MUST display which scope it is currently connected on (GLOBAL /
 * NATIONAL / ISP_LOCAL / LAN / MESH), always visible, never buried in settings." *Always
 * visible* is the requirement, and `AppHeader` — which every screen renders — is the only
 * place that satisfies it. Threading a `scope` prop through fifteen screens and twenty-five
 * route files to reach one pill would put the same value in fifty signatures, and the first
 * screen anyone forgot would silently show a stale network. The value is genuinely global,
 * genuinely single, and changes at most every five seconds; a context is the honest shape.
 *
 * `colors` deliberately stays an explicit prop — the design-system README's rule that a
 * component is told its palette rather than discovering it is untouched. What is ambient
 * here is the *fact about the network*, which is exactly the thing design.md §0 calls
 * ambient by name.
 *
 * ── The label arrives already translated ───────────────────────────────────────────
 * The design system knows nothing about locales. `features/connectivity` maps the wire scope
 * onto an i18n key and hands the finished strings down, so Bangla and English are the same
 * code path rather than a translation layer bolted on at the end.
 */

import { createContext, useContext, type ComponentProps, type PropsWithChildren } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

export type ReachTone = 'ok' | 'limited' | 'critical';

export interface ReachScopeDisplay {
  /** Short name for the pill — "Same ISP", "একই আইএসপি". Already translated. */
  readonly label: string;
  /**
   * How alarming this is for the person, which is NOT the same ordering the path selector
   * prefers. `LAN` is the narrowest scope and the one TP-01 wants; to a person it means
   * "nothing you post leaves this building". Tone reflects what a user can do; the selector
   * reflects what survives.
   */
  readonly tone: ReachTone;
  /** Shape carries the state too — colour is never the sole signal (NFR-A06). */
  readonly icon: ComponentProps<typeof Ionicons>['name'];
  /** One plain sentence about what this means for what they are about to do. */
  readonly consequence: string;
}

export interface ReachScopeContextValue {
  readonly display: ReachScopeDisplay | null;
  /**
   * The ambient inspector — what tapping the pill should do.
   *
   * design.md §4.1: "Tapping it opens a short sheet: what's degraded right now, in plain
   * language." That sheet is the canonical answer and it is the same answer from every
   * screen, so when a host installs an inspector it wins over a per-screen `onPress`. The
   * screens' own handler stays wired and reachable — the sheet offers it as "Network detail"
   * — so nothing that used to be one tap away becomes unreachable, it becomes two.
   */
  readonly onInspect?: () => void;
}

const ReachScopeContext = createContext<ReachScopeContextValue>({ display: null });

export function ReachScopeProvider({
  value,
  children,
}: PropsWithChildren<{ readonly value: ReachScopeContextValue }>) {
  return <ReachScopeContext.Provider value={value}>{children}</ReachScopeContext.Provider>;
}

/** Null until the node has answered once — the pill then falls back to its three-state form. */
export function useReachScope(): ReachScopeContextValue {
  return useContext(ReachScopeContext);
}
