import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { Button } from '@/src/ui/Button';
import { Card } from '@/src/ui/Card';
import { Screen } from '@/src/ui/Screen';
import { useTheme } from '@/src/ui/theme';
import {
  getLocalTrack,
  recoverActiveVisit,
  startVisitTracking,
  stopVisitTracking,
} from '@/src/lib/gps/controller';
import { trackDistanceMeters } from '@/src/lib/gps/geo';
import { getDb } from '@/src/lib/offline/db';
import { SqliteOutbox } from '@/src/lib/offline/outbox';

const VISIT = 'spike-visit';

export default function GpsSpike() {
  const t = useTheme();
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState(0);
  const [meters, setMeters] = useState(0);
  const [pending, setPending] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const track = await getLocalTrack(VISIT);
    setPoints(track.length);
    setMeters(Math.round(trackDistanceMeters(track)));
    setPending(await new SqliteOutbox(getDb()).countPending());
  }

  useEffect(() => {
    void recoverActiveVisit()
      .then((r) => setActive(!!r))
      .then(refresh);
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <Screen title="GPS spike">
      <Card>
        <Text style={[t.type.title, { color: t.colors.ink }]}>{active ? 'Recording' : 'Idle'}</Text>
        <Text style={{ color: t.colors.inkMuted }}>
          {points} points · {meters} m · {pending} outbox items
        </Text>
        {err ? <Text style={{ color: t.colors.danger }}>{err}</Text> : null}
      </Card>
      <Button
        title="Start"
        onPress={() =>
          startVisitTracking(VISIT)
            .then(() => setActive(true))
            .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
        }
        disabled={active}
      />
      <Button
        title="Finish"
        variant="secondary"
        onPress={() =>
          stopVisitTracking()
            .then(() => setActive(false))
            .then(refresh)
        }
        disabled={!active}
      />
    </Screen>
  );
}
