import { describe, expect, it } from 'vitest';
import { parsePluginHazardSnapshot } from '@/services/plugin-map-snapshot';

const quake = { id: 'fixture', place: 'Fixture', magnitude: 5, depthKm: 10, location: { latitude: 0, longitude: 0 }, occurredAt: Date.now(), sourceUrl: 'https://example.com/quake', source: 'USGS fixture', category: 'earthquake' };
const event = { id: 'storm', title: 'Storm fixture', category: 'severeStorms', categoryTitle: 'Storms', lat: 20, lon: -60, date: Date.now(), sourceUrl: 'https://example.com/storm', sourceName: 'NHC fixture', closed: false };
const result = (earthquakes: unknown[], events: unknown[] = []) => ({ structuredContent: { data: { earthquakes: { earthquakes }, events: { events, dataAvailable: true } } } });

describe('plugin hazard snapshot boundary', () => {
  it('keeps supplied zero coordinates and rejects missing, nonfinite or out-of-range positions and dates', () => {
    const snapshot = parsePluginHazardSnapshot(result([quake, { ...quake, location: undefined }, { ...quake, location: { latitude: Infinity, longitude: 10 } }, { ...quake, occurredAt: 1e20 }, { ...quake, location: { latitude: 100, longitude: 10 } }]), ['natural']);
    expect(snapshot.earthquakes).toEqual([quake]);
    expect(snapshot.coverage.earthquakes).toEqual({ accepted: 1, skipped: 4, received: 5 });
  });

  it('preserves cyclone tracks and provenance through the existing converter', () => {
    const storm = { ...event, forecastTrack: [{ lat: 21, lon: -61, hour: 12, windKt: 60, category: 1 }], conePolygon: [{ points: [{ lat: 20, lon: -60 }, { lat: 21, lon: -61 }] }] };
    const snapshot = parsePluginHazardSnapshot(result([], [storm, { ...storm, conePolygon: [{ points: null }] }]), ['natural']);
    expect(snapshot.events?.[0]?.date).toEqual(new Date(storm.date));
    expect(snapshot.events?.[0]?.sourceUrl).toBe(storm.sourceUrl);
    expect(snapshot.events?.[0]?.forecastTrack).toEqual(storm.forecastTrack);
    expect(snapshot.events?.[0]?.conePolygon).toEqual([[[-60, 20], [-61, 21]]]);
    expect(snapshot.coverage.events?.skipped).toBe(1);
  });

  it('distinguishes valid empty data from denied, unavailable, missing and entirely invalid snapshots', () => {
    expect(parsePluginHazardSnapshot(result([]), ['natural']).earthquakes).toEqual([]);
    for (const response of [{ isError: true }, { structuredContent: { data: {} } }, { structuredContent: { data: { earthquakes: { earthquakes: [] }, events: { events: [], dataAvailable: false } } } }, result([{ ...quake, location: undefined }])]) {
      expect(() => parsePluginHazardSnapshot(response, ['natural'])).toThrow(/Previous map data remains visible/);
    }
  });

  it('caps a host snapshot defensively and validates fire dates before converting them', () => {
    expect(parsePluginHazardSnapshot(result(Array(101).fill(quake)), ['natural']).coverage.earthquakes).toEqual({ accepted: 100, skipped: 0, received: 101 });
    const fire = { id: 'fire', location: quake.location, detectedAt: quake.occurredAt, brightness: 350, frp: 12, confidence: 'FIRE_CONFIDENCE_HIGH', region: 'Fixture', dayNight: 'D' };
    const snapshot = parsePluginHazardSnapshot({ structuredContent: { data: { fires: { dataAvailable: true, fireDetections: [fire, { ...fire, detectedAt: 1e20 }] } } } }, ['fires']);
    expect(snapshot.fires).toHaveLength(1);
    expect(snapshot.fires?.[0]).toMatchObject({ lat: 0, lon: 0, confidence: 95 });
    expect(snapshot.coverage.fires?.skipped).toBe(1);
  });
});
