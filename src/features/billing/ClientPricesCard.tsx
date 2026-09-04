import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  clearClientPrice,
  listClientPrices,
  setClientPrice,
} from '@/src/features/billing/clientPrices';
import { listServices } from '@/src/features/services/api';
import { centsToDollarsString, dollarsStringToCents } from '@/src/features/services/form';
import { errorText } from '@/src/lib/errorText';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { TextField } from '@/src/ui/TextField';
import { useTheme } from '@/src/ui/theme';

/**
 * Per-client custom prices (round 6a — grandfathered pricing). One row per
 * active service: the standard price, and this client's override when set.
 * Tap a row to set/change/clear. The override replaces the service's BASE
 * price on every FUTURE visit and series expansion; already-created visits
 * keep their snapshots (invoices never rewrite themselves).
 */
export function ClientPricesCard({
  businessId,
  clientId,
}: {
  businessId: string;
  clientId: string;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceText, setPriceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const services = useQuery({
    queryKey: ['services', businessId],
    queryFn: () => listServices(businessId),
  });
  const overrides = useQuery({
    queryKey: ['clientPrices', businessId, clientId],
    queryFn: () => listClientPrices(businessId, clientId),
  });

  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ['clientPrices', businessId, clientId] });

  async function save(serviceId: string) {
    const cents = dollarsStringToCents(priceText);
    if (cents === null) {
      setError('Enter the price as dollars, like 25 or 27.50');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setClientPrice(businessId, clientId, serviceId, cents);
      setEditingId(null);
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function clear(serviceId: string) {
    setBusy(true);
    setError(null);
    try {
      await clearClientPrice(businessId, clientId, serviceId);
      setEditingId(null);
      refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const active = (services.data ?? []).filter((s) => s.active);
  if (active.length === 0) return null;

  return (
    <Card style={{ gap: t.space.sm }}>
      <Text style={[t.type.label, { color: t.colors.inkMuted }]}>Custom prices</Text>
      <Text style={{ color: t.colors.inkMuted, fontSize: 12 }}>
        A custom price replaces the standard price for this client on future visits (extra-pet
        charges still add on top). Tap a service to set one.
      </Text>
      {active.map((s) => {
        const ov = (overrides.data ?? []).find((o) => o.service_id === s.id);
        const editing = editingId === s.id;
        return (
          <View key={s.id} style={{ gap: t.space.xs }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError(null);
                setEditingId(editing ? null : s.id);
                setPriceText(
                  centsToDollarsString(ov?.base_price_cents ?? s.base_price_cents),
                );
              }}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingVertical: t.space.sm,
                borderBottomWidth: 1,
                borderBottomColor: t.colors.line,
              }}
            >
              <Text style={{ color: t.colors.ink }}>{s.name}</Text>
              {ov ? (
                <Text style={{ color: t.colors.primary, fontWeight: '700' }}>
                  ${centsToDollarsString(ov.base_price_cents)}{' '}
                  <Text style={{ color: t.colors.inkMuted, fontWeight: '400' }}>
                    (standard ${centsToDollarsString(s.base_price_cents)})
                  </Text>
                </Text>
              ) : (
                <Text style={{ color: t.colors.inkMuted }}>
                  ${centsToDollarsString(s.base_price_cents)}
                </Text>
              )}
            </Pressable>
            {editing ? (
              <View style={{ gap: t.space.sm }}>
                <TextField
                  label={`Custom price for ${s.name} ($)`}
                  value={priceText}
                  onChangeText={setPriceText}
                  placeholder={centsToDollarsString(s.base_price_cents)}
                  keyboardType="decimal-pad"
                  autoCorrect={false}
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: t.space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Save" onPress={() => void save(s.id)} loading={busy} />
                  </View>
                  {ov ? (
                    <View style={{ flex: 1 }}>
                      <Button
                        title="Use standard"
                        variant="ghost"
                        onPress={() => void clear(s.id)}
                        disabled={busy}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
    </Card>
  );
}
