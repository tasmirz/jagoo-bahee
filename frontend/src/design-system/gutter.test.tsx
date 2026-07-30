import { FlatList, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import renderer, { act } from 'react-test-renderer';
import { InfiniteList } from './list';
import { Page, PageHeader } from './layout';
import { AppScene } from './scene';
import { SectionHeader, StatusBanner } from './components';
import { palettes } from './tokens';

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: () => undefined }),
}));

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

type Style = Record<string, unknown>;

/** RN accepts style arrays and nested arrays; flatten before asserting on any single value. */
function flatten(style: unknown): Style {
  return Object.assign(
    {},
    ...(([] as unknown[]).concat(style ?? []).flat(Infinity).filter(Boolean) as object[]),
  ) as Style;
}

function render(element: React.ReactElement): renderer.ReactTestRenderer {
  let view!: renderer.ReactTestRenderer;
  act(() => {
    view = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{element}</SafeAreaProvider>);
  });
  return view;
}

/** The one `View` whose flattened style matches — searched by shape, not by tree position. */
function styleOf(view: renderer.ReactTestRenderer, match: (style: Style) => boolean): Style {
  const found = view.root
    .findAllByType(View)
    .map((node) => flatten(node.props.style))
    .filter(match);
  expect(found).not.toHaveLength(0);
  return found[0]!;
}

/**
 * The gutter contract.
 *
 * Screens used to split the horizontal inset between themselves and their children: `Page` had
 * none, `StatusBanner` and `SectionHeader` each carried their own `marginHorizontal: 16`, and a
 * `Button` or a `Row` carried nothing at all — so on the Signal screens a heading sat flush
 * against the edge of the phone while the card under it was inset by 16.
 *
 * `Page` owns the inset now and every shared child is gutter-free. Each case below asserts the
 * passing shape *and* the shape that would reintroduce the bug, because a test that only proves
 * "some padding exists somewhere" passes just as happily when both sides pad and the content is
 * inset twice.
 */
describe('the horizontal gutter belongs to Page', () => {
  const isContentColumn = (style: Style) => style.maxWidth !== undefined && style.gap !== undefined;

  it('insets the content column of a scrolling page', () => {
    const view = render(
      <Page colors={palettes.light}>
        <Text>body</Text>
      </Page>,
    );
    const style = styleOf(view, isContentColumn);
    expect(style.paddingLeft as number).toBeGreaterThan(0);
    expect(style.paddingRight).toBe(style.paddingLeft);
    // Children are stacked with real air between them, not flush.
    expect(style.gap as number).toBeGreaterThan(0);
    act(() => view.unmount());
  });

  it('gives the inset up when a child owns the scroll container', () => {
    const view = render(
      <Page colors={palettes.light} scroll={false} gutter={false}>
        <Text>body</Text>
      </Page>,
    );
    expect(styleOf(view, isContentColumn).paddingLeft).toBe(0);
    act(() => view.unmount());
  });

  it('hands that same inset to a list that scrolls edge to edge', () => {
    const view = render(
      <InfiniteList
        colors={palettes.light}
        data={['a']}
        keyExtractor={(item) => item}
        renderItem={({ item }) => <Text>{item}</Text>}
      />,
    );
    const content = flatten(view.root.findByType(FlatList).props.contentContainerStyle);
    expect(content.paddingHorizontal as number).toBeGreaterThan(0);
    act(() => view.unmount());
  });
});

/**
 * The top safe area has exactly one owner too.
 *
 * `PageHeader` has to claim `insets.top` itself — it is a frosted surface that extends *under*
 * the status bar rather than starting below it. `AppScene` wrapped every route in a
 * `SafeAreaView` with `edges={['top', ...]}`, so the notch was paid twice and every headed
 * screen's title sat about 47pt lower than designed.
 */
describe('the top safe-area inset belongs to PageHeader', () => {
  it('is not also claimed by the route frame', () => {
    const view = render(
      <AppScene colors={palettes.light}>
        <Text>body</Text>
      </AppScene>,
    );
    expect(view.root.findByType(SafeAreaView).props.edges).not.toContain('top');
    act(() => view.unmount());
  });

  it('stays available to a route that opts in because it draws its own hero', () => {
    const view = render(
      <AppScene colors={palettes.light} edges={['top', 'left', 'right']}>
        <Text>body</Text>
      </AppScene>,
    );
    expect(view.root.findByType(SafeAreaView).props.edges).toContain('top');
    act(() => view.unmount());
  });

  it('is applied once, by the header', () => {
    const view = render(<PageHeader colors={palettes.light} mode="light" title="Signal" />);
    const header = styleOf(view, (s) => s.paddingTop !== undefined && s.borderBottomWidth !== undefined);
    expect(header.paddingTop as number).toBeGreaterThanOrEqual(METRICS.insets.top);
    act(() => view.unmount());
  });
});

describe('shared children never pay for the gutter themselves', () => {
  it('leaves StatusBanner flush with its container', () => {
    const view = render(
      <StatusBanner colors={palettes.light} icon="alert-circle-outline" title="t" body="b" />,
    );
    const style = styleOf(view, (s) => s.borderRadius !== undefined && s.borderWidth === 1);
    expect(style.marginHorizontal).toBeUndefined();
    expect(style.paddingHorizontal).toBeUndefined();
    act(() => view.unmount());
  });

  it('leaves SectionHeader flush with its container', () => {
    const view = render(<SectionHeader colors={palettes.light} title="Section" />);
    const style = styleOf(view, (s) => s.justifyContent === 'space-between');
    expect(style.marginHorizontal).toBeUndefined();
    expect(style.paddingHorizontal).toBeUndefined();
    act(() => view.unmount());
  });
});
