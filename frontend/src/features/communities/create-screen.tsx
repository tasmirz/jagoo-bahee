import { useState } from 'react';
import { communityId } from '@jagoo/sdk/core';
import { StyleSheet, View } from 'react-native';
import type { HomeNode } from '../../data/node-config';
import { createForumCommunity } from '../../signer';
import type { AppPalette, ThemeMode } from '../../design-system';
import { spacing } from '../../design-system';
import {
  Button,
  Card,
  Page,
  PageHeader,
  StatusBanner,
  TextAreaField,
  TextField,
  ToggleRow,
} from '../../design-system';

/**
 * Rebuilt onto the shared shell and form primitives. This screen used to be a single-line JSX
 * expression with its own `Field`/`Toggle` copies of `TextField`/`ToggleRow`, its own `720`
 * reading measure and its own hand-rolled header — four places for the same look to drift from
 * the rest of the app, and it had.
 */
export function CommunityCreateScreen({ colors, mode, homeNode, onBack, onCreated }: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly homeNode: HomeNode;
  readonly onBack: () => void;
  readonly onCreated: (communityId: string) => void;
}) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [isPrivate, setPrivate] = useState(false);
  const [isNsfw, setNsfw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nameTouched = name.length > 0;
  const nameValid = /^[a-z0-9_]{3,21}$/.test(name);
  const valid = nameValid && title.trim().length > 0 && description.trim().length > 0;

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      await createForumCommunity(
        homeNode.baseUrl,
        { name, title, description, rulesMarkdown: rules, isPrivate, isNsfw },
        homeNode.discovery.services.auditLogs,
      );
      onCreated(communityId(name, homeNode.discovery.node.serverId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the community.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <PageHeader
        colors={colors}
        mode={mode}
        title="Create a community"
        subtitle="Signed under your Forum identity"
        onBack={onBack}
      />
      <Page colors={colors}>
        {error ? (
          <StatusBanner
            colors={colors}
            icon="alert-circle-outline"
            title="Community not created"
            body={error}
            tone="danger"
          />
        ) : null}
        <Card colors={colors} style={styles.formCard}>
          <TextField
            colors={colors}
            label="Community name"
            value={name}
            onChangeText={setName}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={21}
            placeholder="general"
            // Only complain once there is something to complain about — a red field on an
            // untouched form reads as "you did it wrong" before anything has been done.
            error={nameTouched && !nameValid ? '3–21 lowercase letters, numbers, or underscores' : undefined}
            hint="This becomes part of the community's permanent identifier."
          />
          <TextField
            colors={colors}
            label="Display title"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            placeholder="What people see at the top"
          />
          <TextAreaField
            colors={colors}
            label="Description"
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            minHeight={96}
            placeholder="Who is this community for?"
          />
          <TextAreaField
            colors={colors}
            label="Rules"
            value={rules}
            onChangeText={setRules}
            minHeight={108}
            placeholder="One clear rule per line"
            hint="Rules are published with the community and signed with it."
          />
        </Card>
        <Card colors={colors} style={styles.formCard}>
          <ToggleRow
            colors={colors}
            label="Private community"
            hint="Only approved members can read and post."
            value={isPrivate}
            onChange={setPrivate}
          />
          <ToggleRow
            colors={colors}
            label="Mature content"
            hint="Readers see it blurred until they opt in."
            value={isNsfw}
            onChange={setNsfw}
          />
        </Card>
        <Button
          colors={colors}
          disabled={!valid || busy}
          loading={busy}
          icon="add-circle-outline"
          label="Create community"
          onPress={() => void publish()}
        />
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  /** `PageHeader` is sticky and owns the top inset, so the page below it simply fills. */
  page: { flex: 1 },
  /** A group of related controls reads as one surface instead of a loose vertical run. */
  formCard: { gap: spacing.md },
});
