/**
 * `Select` — the control that replaced "paste a 56-character channel ID into a text box".
 *
 * ── Why this is a design-system component and not a screen-local one ────────────────
 * `SelectField` already existed and had ZERO callers, because it is only the closed state:
 * a chevron and an `onPress`. Every screen that needed one choice from a known list reached
 * for a free-text `Field` instead. So the Signal studio asked you to type an identifier that
 * can only ever be one of the channels the device holds a key for, and a single wrong
 * character came back as "channel is not known here" — or, past the node, as "channel
 * signing key is not present in this vault".
 *
 * The assertions below are the properties a screen relies on: choosing reports the VALUE and
 * not the label, the list closes behind the choice, an empty list says so rather than
 * rendering a dead control, and selection carries a glyph and not only a tint (NFR-A06).
 */

import { Pressable, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Select } from './forms';
import { palettes } from './tokens';

const colors = palettes.light;

const OPTIONS = [
  { value: 'jbc1dhaka', label: 'Dhaka Relief', detail: 'jbc1dhaka… · last #4' },
  { value: 'jbc1mirpur', label: 'Mirpur Water', detail: 'jbc1mirpur… · last #0' },
] as const;

function render(element: React.ReactElement): renderer.ReactTestRenderer {
  let view!: renderer.ReactTestRenderer;
  act(() => {
    view = renderer.create(element);
  });
  return view;
}

const texts = (view: renderer.ReactTestRenderer): string[] =>
  view.root.findAllByType(Text).flatMap((node) =>
    ([] as unknown[]).concat(node.props.children ?? []).filter((child) => typeof child === 'string'),
  ) as string[];

/** The trigger is the first Pressable; option rows follow it. */
const pressables = (view: renderer.ReactTestRenderer) => view.root.findAllByType(Pressable);

describe('Select', () => {
  it('shows the placeholder until something is chosen, and the LABEL after', () => {
    const closed = render(
      <Select
        colors={colors}
        onChange={() => undefined}
        options={OPTIONS}
        placeholder="Choose a channel"
        value={null}
      />,
    );
    expect(texts(closed)).toContain('Choose a channel');

    const chosen = render(
      <Select
        colors={colors}
        onChange={() => undefined}
        options={OPTIONS}
        placeholder="Choose a channel"
        value="jbc1mirpur"
      />,
    );
    expect(texts(chosen)).toContain('Mirpur Water');
    expect(texts(chosen)).not.toContain('Choose a channel');
  });

  it('reports the value, not the label, and closes behind the choice', () => {
    const picked: string[] = [];
    const view = render(
      <Select
        colors={colors}
        onChange={(value) => picked.push(value)}
        options={OPTIONS}
        placeholder="Choose a channel"
        value={null}
      />,
    );

    // Closed: the trigger only.
    expect(pressables(view)).toHaveLength(1);
    act(() => pressables(view)[0]!.props.onPress());
    // Open: trigger plus one row per option.
    expect(pressables(view)).toHaveLength(1 + OPTIONS.length);
    expect(texts(view)).toContain('Dhaka Relief');

    act(() => pressables(view)[2]!.props.onPress());
    expect(picked).toEqual(['jbc1mirpur']);
    expect(pressables(view)).toHaveLength(1);
  });

  it('marks the selected row with a glyph, not only a tint (NFR-A06)', () => {
    const view = render(
      <Select
        colors={colors}
        onChange={() => undefined}
        options={OPTIONS}
        placeholder="Choose a channel"
        value="jbc1dhaka"
      />,
    );
    const before = view.root.findAllByType(Ionicons).length;
    act(() => pressables(view)[0]!.props.onPress());
    const icons = view.root.findAllByType(Ionicons);
    // The chevron, plus exactly one checkmark for the one selected row.
    expect(icons.filter((node) => node.props.name === 'checkmark')).toHaveLength(1);
    expect(icons.length).toBe(before + 1);
  });

  it('says an empty list is empty instead of rendering a dead control', () => {
    const view = render(
      <Select
        colors={colors}
        emptyLabel="No channels on this device yet — declare one first."
        onChange={() => undefined}
        options={[]}
        placeholder="Choose a channel"
        value={null}
      />,
    );
    act(() => pressables(view)[0]!.props.onPress());
    expect(texts(view)).toContain('No channels on this device yet — declare one first.');
    // Nothing selectable, so the trigger stays the only pressable.
    expect(pressables(view)).toHaveLength(1);
  });
});
