import { useQuery } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { useRefetchOnFocus } from '@/src/lib/useRefetchOnFocus';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

import {
  addDocument,
  deleteDocument,
  DOC_TYPES,
  docTypeLabel,
  expiryState,
  listDocuments,
  signedDocumentUrl,
  type DocType,
  type PetDocument,
  type PickedDocSource,
} from './documents';
import { parseDateOnly } from './helpers';
import { errorText } from '@/src/lib/errorText';

type Props = { businessId: string; petId: string };

/** Vaccine documents card on the pet profile (Plan 2 Task 7). */
export function DocumentsSection({ businessId, petId }: Props) {
  const t = useTheme();
  const [adding, setAdding] = useState(false);
  const [docType, setDocType] = useState<DocType>('rabies');
  const [expires, setExpires] = useState('');
  const [expiresError, setExpiresError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docs = useQuery({
    queryKey: ['pet-documents', businessId, petId],
    queryFn: () => listDocuments(businessId, petId),
  });
  useRefetchOnFocus(docs.refetch);

  async function openDocument(doc: PetDocument) {
    setError(null);
    try {
      const url = await signedDocumentUrl(doc.storage_path);
      await Linking.openURL(url);
    } catch (e) {
      setError(errorText(e));
    }
  }

  // Two-tap delete confirm (Alert.alert buttons no-op on web — team.tsx lesson).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  async function doDelete(doc: PetDocument) {
    setError(null);
    try {
      await deleteDocument(businessId, doc);
      setConfirmDeleteId(null);
      await docs.refetch();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function pickAndUpload(kind: 'camera' | 'library' | 'pdf') {
    setError(null);
    const trimmed = expires.trim();
    if (trimmed && !parseDateOnly(trimmed)) {
      setExpiresError('Use YYYY-MM-DD');
      return;
    }
    setExpiresError(null);
    try {
      let source: PickedDocSource | null = null;
      if (kind === 'pdf') {
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
        if (!result.canceled && result.assets[0]) {
          source = { uri: result.assets[0].uri, kind: 'pdf' };
        }
      } else {
        if (kind === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            setError('Camera permission is needed to take a photo.');
            return;
          }
        }
        const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
        const result =
          kind === 'camera'
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options);
        if (!result.canceled && result.assets[0]) {
          source = { uri: result.assets[0].uri, kind: 'image' };
        }
      }
      if (!source) return;
      setBusy(true);
      await addDocument({
        businessId,
        petId,
        type: docType,
        expiresOn: trimmed || null,
        source,
      });
      setAdding(false);
      setExpires('');
      setDocType('rabies');
      await docs.refetch();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Vaccine documents</Text>
      {(docs.data ?? []).map((doc) => {
        const state = expiryState(doc.expires_on);
        return (
          <View
            key={doc.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.space.sm,
              paddingVertical: t.space.sm,
              borderBottomWidth: 1,
              borderBottomColor: t.colors.line,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${docTypeLabel(doc.type)} document`}
              onPress={() => void openDocument(doc)}
              style={{ flex: 1 }}
            >
              <Text style={[t.type.body, { color: t.colors.ink }]}>{docTypeLabel(doc.type)}</Text>
              <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
                {doc.expires_on ? `Expires ${doc.expires_on}` : 'No expiry date'}
              </Text>
            </Pressable>
            {state === 'expired' ? (
              <Text style={[t.type.label, { color: t.colors.danger }]}>Expired</Text>
            ) : null}
            {state === 'warning' ? (
              <Text style={[t.type.label, { color: t.colors.warning }]}>Expires soon</Text>
            ) : null}
            {confirmDeleteId === doc.id ? (
              <View style={{ flexDirection: 'row', gap: t.space.md }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void doDelete(doc)}
                  hitSlop={8}
                >
                  <Text style={{ color: t.colors.danger, fontSize: 12, fontWeight: '700' }}>
                    Really delete
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmDeleteId(null)}
                  hitSlop={8}
                >
                  <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>Keep</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${docTypeLabel(doc.type)} document`}
                onPress={() => setConfirmDeleteId(doc.id)}
              >
                <Text style={{ color: t.colors.danger, fontSize: 12 }}>Remove</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      {docs.data?.length === 0 && !adding ? (
        <Text style={{ color: t.colors.inkMuted }}>No documents yet</Text>
      ) : null}
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
      {adding ? (
        <View style={{ gap: t.space.sm, marginTop: t.space.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.space.xs }}>
            {DOC_TYPES.map((type) => {
              const selected = type === docType;
              return (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setDocType(type)}
                  style={{
                    paddingVertical: t.space.xs,
                    paddingHorizontal: t.space.md,
                    borderRadius: t.radius.pill,
                    borderWidth: 1,
                    borderColor: selected ? t.colors.primary : t.colors.line,
                    backgroundColor: selected ? t.colors.primary : t.colors.surfaceRaised,
                  }}
                >
                  <Text style={{ color: selected ? t.colors.onPrimary : t.colors.ink, fontSize: 13 }}>
                    {docTypeLabel(type)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label="Expires on (optional)"
            value={expires}
            onChangeText={setExpires}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            error={expiresError ?? undefined}
          />
          <View style={{ flexDirection: 'row', gap: t.space.sm }}>
            <View style={{ flex: 1 }}>
              <Button
                title="Camera"
                variant="secondary"
                loading={busy}
                onPress={() => void pickAndUpload('camera')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Library"
                variant="secondary"
                loading={busy}
                onPress={() => void pickAndUpload('library')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="PDF"
                variant="secondary"
                loading={busy}
                onPress={() => void pickAndUpload('pdf')}
              />
            </View>
          </View>
          <Button title="Cancel" variant="ghost" disabled={busy} onPress={() => setAdding(false)} />
        </View>
      ) : (
        <View style={{ marginTop: t.space.sm }}>
          <Button title="Add document" variant="secondary" onPress={() => setAdding(true)} />
        </View>
      )}
    </Card>
  );
}
