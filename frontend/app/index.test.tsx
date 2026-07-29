import renderer, { act } from 'react-test-renderer';
import Home from './index';
import { featureDestinations } from '../src/features/catalog';

describe('Home', () => {
  it('renders offline with no network or server call', () => {
    const tree = renderer.create(<Home />).toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders the ambient trust and reach shell', () => {
    const root = renderer.create(<Home />).root;
    expect(root.findAllByProps({ accessibilityLabel: 'Network reach: Connected' })).not.toHaveLength(
      0,
    );
    expect(
      root.findAllByProps({
        accessibilityLabel: 'Open post: Community-driven innovation is shaping the future',
      }),
    ).not.toHaveLength(0);
  });

  it.each(featureDestinations)(
    'opens the $title P1 destination from the app shell',
    ({ title }) => {
      let view!: renderer.ReactTestRenderer;
      act(() => {
        view = renderer.create(<Home />);
      });
      act(() => {
        view.root.findByProps({ accessibilityLabel: 'Profile' }).props.onPress();
      });
      act(() => {
        view.root.findByProps({ accessibilityLabel: `Open ${title}` }).props.onPress();
      });
      expect(
        view.root.findAll(
          (node) => node.props.accessibilityRole === 'header' && node.props.children === title,
        ),
      ).not.toHaveLength(0);
      act(() => view.unmount());
    },
  );
});
