import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../../src/application/app-provider';
import { EditPostScreen } from '../../../src/features/forum/edit-post-screen';
import { AppScene } from '../../../src/ui/scene';

export default function EditPostRoute() { const router = useRouter(); const { contentId } = useLocalSearchParams<{ readonly contentId: string }>(); const { colors, homeNode } = useApp(); if (!homeNode || !contentId) return null; return <AppScene colors={colors}><EditPostScreen colors={colors} contentId={contentId} homeNode={homeNode} onBack={() => router.back()} onDone={() => router.replace({ pathname: '/post/[contentId]', params: { contentId } })} /></AppScene>; }
