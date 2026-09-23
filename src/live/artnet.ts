import { PROFILE_BY_ID, decodeFixture, findMode } from "../fixtures/profiles";
import type {
  DmxUniversePacket,
  FixtureDefinition,
  FixtureFrame
} from "../viz/types";

let normalizedSequence = 0;

export function fixtureFrameFromDmxPacket(
  packet: DmxUniversePacket,
  fixtures: FixtureDefinition[],
  source: "artnet" | "sacn"
): FixtureFrame {
  const states = fixtures.flatMap((fixture) => {
    if (!fixture.patch.enabled || fixture.patch.universe !== packet.universe) return [];
    const profile = PROFILE_BY_ID.get(fixture.patch.profileId);
    if (!profile) return [];
    const mode = findMode(profile.id, fixture.patch.modeId);
    if (!mode) return [];
    return [{
      id: fixture.id, name: fixture.name, universe: fixture.patch.universe, address: fixture.patch.address,
      ...decodeFixture(profile, mode, packet.data, fixture.patch.address)
    }];
  });

  return {
    version: 1,
    showId: source,
    sequence: ++normalizedSequence,
    timestamp: Date.now(),
    fixtures: states
  };
}
