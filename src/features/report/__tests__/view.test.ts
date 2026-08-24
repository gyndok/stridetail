import type { ReportPayload } from '../api';
import { reportEndpoint } from '../api';
import {
  distanceText,
  durationText,
  localTime,
  petsServiceLine,
  photoUrls,
  reportDateLine,
  statItems,
  timelineLabel,
} from '../view';

const tz = 'America/Chicago';

const summary = (over: Partial<ReportPayload['summary']> = {}): ReportPayload['summary'] => ({
  petNames: ['Biscuit'],
  serviceName: 'Walk',
  scheduledStart: '2026-09-02T15:00:00Z',
  scheduledEnd: '2026-09-02T15:30:00Z',
  startedAt: '2026-09-02T15:02:00Z',
  finishedAt: '2026-09-02T15:34:00Z',
  durationMin: 32,
  distanceM: 333.59,
  ...over,
});

test('reportDateLine renders the started day in the business tz', () => {
  // 15:02Z on Sep 2 is 10:02 CDT — still Wednesday, September 2 locally.
  expect(reportDateLine(summary(), tz)).toBe('Wednesday, September 2');
});

test('reportDateLine falls back to the scheduled start, then to empty', () => {
  expect(reportDateLine(summary({ startedAt: null }), tz)).toBe('Wednesday, September 2');
  expect(reportDateLine(summary({ startedAt: null, scheduledStart: null }), tz)).toBe('');
});

test('petsServiceLine joins pets and service, tolerating missing halves', () => {
  expect(petsServiceLine(summary({ petNames: ['Biscuit', 'Max'] }))).toBe('Biscuit & Max · Walk');
  expect(petsServiceLine(summary({ petNames: [] }))).toBe('Walk');
  expect(petsServiceLine(summary({ serviceName: null }))).toBe('Biscuit');
});

test('localTime renders business-local wall clock', () => {
  expect(localTime('2026-09-02T15:02:00Z', tz)).toBe('10:02 AM');
});

test('duration and distance texts hide when empty', () => {
  expect(durationText(32)).toBe('32 min');
  expect(durationText(null)).toBeNull();
  expect(distanceText(333.59)).toBe('0.21 mi');
  expect(distanceText(0)).toBeNull();
  expect(distanceText(null)).toBeNull();
});

test('statItems collects only present stats', () => {
  expect(statItems(summary())).toEqual([
    { label: 'Duration', value: '32 min' },
    { label: 'Distance', value: '0.21 mi' },
  ]);
  expect(statItems(summary({ durationMin: null, distanceM: null }))).toEqual([]);
});

test('timelineLabel covers every event type and passes unknowns through', () => {
  expect(timelineLabel('arrived')).toBe('Arrived');
  expect(timelineLabel('started')).toBe('Visit started');
  expect(timelineLabel('pee')).toBe('Pee break');
  expect(timelineLabel('poop')).toBe('Poop');
  expect(timelineLabel('ate')).toBe('Ate');
  expect(timelineLabel('drank')).toBe('Drank water');
  expect(timelineLabel('meds')).toBe('Medication given');
  expect(timelineLabel('note')).toBe('Note');
  expect(timelineLabel('photo')).toBe('Photo');
  expect(timelineLabel('finished')).toBe('Visit finished');
  expect(timelineLabel('mystery')).toBe('mystery');
});

test('photoUrls keeps only photo-bearing events, in timeline order', () => {
  const timeline: ReportPayload['timeline'] = [
    { type: 'arrived', occurredAt: '2026-09-02T15:02:00Z', text: null, photoUrl: null },
    { type: 'photo', occurredAt: '2026-09-02T15:10:00Z', text: null, photoUrl: 'https://a/1.jpg' },
    { type: 'photo', occurredAt: '2026-09-02T15:20:00Z', text: null, photoUrl: 'https://a/2.jpg' },
  ];
  expect(photoUrls(timeline)).toEqual(['https://a/1.jpg', 'https://a/2.jpg']);
});

test('reportEndpoint tolerates a trailing slash on the project URL', () => {
  expect(reportEndpoint('https://x.supabase.co')).toBe('https://x.supabase.co/functions/v1/report-public');
  expect(reportEndpoint('https://x.supabase.co/')).toBe('https://x.supabase.co/functions/v1/report-public');
});
