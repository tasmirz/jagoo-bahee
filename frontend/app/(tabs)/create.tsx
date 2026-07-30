import { Redirect } from 'expo-router';

/**
 * The Create tab is a modal composer (`/composer`), opened directly by the tab bar's
 * `onChange` handler so it is reachable from every tab, not only Home. This route only exists
 * so a deep link or a stale nav state landing on the literal tab still gets somewhere useful.
 */
export default function CreateRoute() {
  return <Redirect href={'/composer' as never} />;
}
