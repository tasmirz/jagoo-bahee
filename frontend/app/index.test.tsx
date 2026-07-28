import renderer from 'react-test-renderer';
import Home from './index';

describe('Home', () => {
  it('renders offline with no network or server call', () => {
    const tree = renderer.create(<Home />).toJSON();
    expect(tree).toBeTruthy();
  });
});
