import { FlatList, RefreshControl, Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { InfiniteList } from './list';
import { ContentColumn } from './layout';
import { palettes } from './tokens';

/**
 * Two layout contracts that were each silently false in shipped builds, so each test asserts
 * the failing shape as well as the passing one.
 */
describe('InfiniteList refresh affordance', () => {
  it('refreshes by pull gesture, not by a button above the first row', () => {
    const onRefresh = jest.fn();
    let view!: renderer.ReactTestRenderer;
    act(() => {
      view = renderer.create(
        <InfiniteList
          colors={palettes.light}
          data={['a']}
          keyExtractor={(item) => item}
          onRefresh={onRefresh}
          refreshing={false}
          renderItem={({ item }) => <Text>{item}</Text>}
        />,
      );
    });

    const control = view.root.findByType(FlatList).props.refreshControl;
    expect(control.type).toBe(RefreshControl);
    expect(control.props.refreshing).toBe(false);
    expect(control.props.onRefresh).toBe(onRefresh);
    // The regression this replaces: a tappable "Refresh content" row rendered ahead of the
    // list, which both consumed vertical space and left the pull gesture inert.
    expect(
      view.root.findAll((node) => node.props.children === 'Refresh content'),
    ).toHaveLength(0);
    act(() => view.unmount());
  });

  it('omits the control entirely when a list is not refreshable', () => {
    let view!: renderer.ReactTestRenderer;
    act(() => {
      view = renderer.create(
        <InfiniteList
          colors={palettes.light}
          data={['a']}
          keyExtractor={(item) => item}
          renderItem={({ item }) => <Text>{item}</Text>}
        />,
      );
    });
    expect(view.root.findByType(FlatList).props.refreshControl).toBeUndefined();
    act(() => view.unmount());
  });
});

describe('ContentColumn height contract', () => {
  // A `FlatList` inside a height-auto parent measures to zero, which is how the home feed
  // rendered blank below its sort chips while the query was returning posts.
  const flattened = (node: renderer.ReactTestInstance) =>
    ([] as unknown[]).concat(node.props.style ?? []).flat(Infinity).filter(Boolean) as {
      readonly flex?: number;
    }[];

  it('fills its parent when it wraps a virtualized list', () => {
    let view!: renderer.ReactTestRenderer;
    act(() => {
      view = renderer.create(
        <ContentColumn fill>
          <Text>body</Text>
        </ContentColumn>,
      );
    });
    expect(flattened(view.root.findByType(View))).toContainEqual({ flex: 1 });
    act(() => view.unmount());
  });

  it('stays content-sized by default, so a scrolling page still scrolls', () => {
    let view!: renderer.ReactTestRenderer;
    act(() => {
      view = renderer.create(
        <ContentColumn>
          <Text>body</Text>
        </ContentColumn>,
      );
    });
    expect(flattened(view.root.findByType(View))).not.toContainEqual({ flex: 1 });
    act(() => view.unmount());
  });
});
