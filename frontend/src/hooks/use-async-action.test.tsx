import renderer, { act } from 'react-test-renderer';
import { useAsyncAction, type AsyncActionRunner } from './use-async-action';

/** The threshold used throughout, short enough that a real timer settles inside a test. */
const SLOW_MS = 40;

/**
 * Drive the hook through a host component.
 *
 * `@testing-library/react-native` is deliberately not a dependency of this workspace, so
 * component tests here mount through `react-test-renderer` — see `design-system/list.test.tsx`.
 */
function mount(): { current: AsyncActionRunner } {
  const handle = { current: null as unknown as AsyncActionRunner };
  function Host() {
    handle.current = useAsyncAction(SLOW_MS);
    return null;
  }
  let view!: renderer.ReactTestRenderer;
  act(() => {
    view = renderer.create(<Host />);
  });
  mounted.push(view);
  return handle;
}

/** Unmounted after every test so a late timer cannot fire into the next one. */
const mounted: renderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    for (const view of mounted.splice(0)) view.unmount();
  });
});

const settle = async (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe('useAsyncAction', () => {
  it('reports busy while an action runs and settles when it resolves', async () => {
    const hook = mount();
    let release: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });

    let outcome!: Promise<string | null>;
    act(() => {
      outcome = hook.current.run('Publishing', () => pending);
    });
    expect(hook.current.busy).toBe(true);
    expect(hook.current.label).toBe('Publishing');
    expect(hook.current.late).toBe(false);

    await act(async () => {
      release('done');
      await outcome;
    });
    expect(hook.current.busy).toBe(false);
    await expect(outcome).resolves.toBe('done');
  });

  /**
   * The reason this hook exists: a request over a dying uplink does not reject, it hangs.
   * Without this transition the screen shows a spinner forever and the person holding the
   * phone cannot tell a slow server from a dead one.
   */
  it('goes late once the action outlives the threshold', async () => {
    const hook = mount();
    act(() => {
      void hook.current.run('Publishing', () => new Promise<never>(() => {}));
    });

    expect(hook.current.late).toBe(false);
    await settle(SLOW_MS * 2);

    expect(hook.current.late).toBe(true);
    expect(hook.current.busy).toBe(true);
  });

  it('keep waiting dismisses the prompt without cancelling the action', async () => {
    const hook = mount();
    let signal!: AbortSignal;
    act(() => {
      void hook.current.run('Publishing', (received) => {
        signal = received;
        return new Promise<never>(() => {});
      });
    });
    await settle(SLOW_MS * 2);
    expect(hook.current.late).toBe(true);

    act(() => hook.current.keepWaiting());

    expect(hook.current.late).toBe(false);
    expect(hook.current.busy).toBe(true);
    expect(signal.aborted).toBe(false);
  });

  it('cancel aborts the in-flight request and resolves null, not an error', async () => {
    const hook = mount();
    let signal!: AbortSignal;
    let outcome!: Promise<string | null>;
    act(() => {
      outcome = hook.current.run(
        'Publishing',
        (received) =>
          new Promise<string>((_resolve, reject) => {
            signal = received;
            received.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      );
    });

    await act(async () => {
      hook.current.cancel();
      await outcome;
    });

    expect(signal.aborted).toBe(true);
    expect(hook.current.busy).toBe(false);
    // A cancellation is not a failure. Showing "Action failed" would blame the user for a
    // choice the UI asked them to make.
    expect(hook.current.error).toBe('');
    await expect(outcome).resolves.toBeNull();
  });

  it('surfaces a real failure as an error', async () => {
    const hook = mount();
    await act(async () => {
      await hook.current
        .run('Publishing', () => Promise.reject(new Error('node refused the envelope')))
        .catch(() => undefined);
    });

    expect(hook.current.error).toBe('node refused the envelope');
    expect(hook.current.busy).toBe(false);
  });

  it('starting a second action aborts the first', async () => {
    const hook = mount();
    let first!: AbortSignal;
    act(() => {
      void hook.current
        .run('First', (signal) => {
          first = signal;
          return new Promise<never>(() => {});
        })
        .catch(() => undefined);
    });

    act(() => {
      void hook.current.run('Second', () => new Promise<never>(() => {}));
    });

    expect(first.aborted).toBe(true);
    expect(hook.current.label).toBe('Second');
  });
});
