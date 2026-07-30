import { useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import type { HomeNode } from '../../data/node-config';
import { createForumCommunity } from '../../signer';
import type { AppPalette } from '../../theme';
import { spacing, type as typography } from '../../theme';
import { Button, IconButton, Screen, StatusBanner } from '../../ui/primitives';

export function CommunityCreateScreen({ colors, homeNode, onBack, onCreated }: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly onBack: () => void;
  readonly onCreated: (contentId: string) => void;
}) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [isNsfw, setNsfw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const valid = /^[a-z0-9_]{3,21}$/.test(name) && title.trim().length > 0 && description.trim().length > 0;
  const publish = async () => {
    setBusy(true); setError('');
    try {
      const result = await createForumCommunity(homeNode.baseUrl, { name, title, description, rulesMarkdown: rules, isPrivate, isNsfw }, homeNode.discovery.services.auditLogs);
      onCreated(result.contentId);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create the community.'); } finally { setBusy(false); }
  };
  return <Screen colors={colors}><View style={{ minHeight: 64, paddingHorizontal: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}><IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} /><Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>Create a community</Text></View><View style={{ padding: spacing.md, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' }}>{error ? <StatusBanner colors={colors} icon="alert-circle-outline" title="Community not created" body={error} tone="danger" /> : null}<Text style={[typography.body, { color: colors.text2 }]}>Choose a stable name. The community and its rules are signed under your Forum identity.</Text><Field colors={colors} label="Community name" value={name} onChange={setName} hint="3–21 lowercase letters, numbers, or underscores" /><Field colors={colors} label="Display title" value={title} onChange={setTitle} /><Field colors={colors} label="Description" value={description} onChange={setDescription} multiline /><Field colors={colors} label="Rules" value={rules} onChange={setRules} multiline hint="One clear rule per line works well." /><Toggle colors={colors} label="Private community" value={isPrivate} onChange={setPrivate} /><Toggle colors={colors} label="Mature content" value={isNsfw} onChange={setNsfw} /><Button colors={colors} disabled={!valid || busy} label={busy ? 'Creating and proving work…' : 'Create community'} onPress={() => void publish()} /></View></Screen>;
}

function Field({ colors, label, value, onChange, hint, multiline }: { readonly colors: AppPalette; readonly label: string; readonly value: string; readonly onChange: (value: string) => void; readonly hint?: string; readonly multiline?: boolean }) { return <View style={{ gap: spacing.xs }}><Text style={[typography.label, { color: colors.text }]}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" multiline={multiline} onChangeText={onChange} placeholderTextColor={colors.text3} style={[typography.body, { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, color: colors.text, padding: spacing.md, minHeight: multiline ? 108 : 52, textAlignVertical: multiline ? 'top' : 'center' }]} value={value} />{hint ? <Text style={[typography.caption, { color: colors.text2 }]}>{hint}</Text> : null}</View>; }
function Toggle({ colors, label, value, onChange }: { readonly colors: AppPalette; readonly label: string; readonly value: boolean; readonly onChange: (value: boolean) => void }) { return <View style={{ minHeight: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={[typography.label, { color: colors.text }]}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: colors.ember }} /></View>; }
