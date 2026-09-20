import { PROFILE_BY_ID } from "../fixtures/profiles";
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
    return [{
      id: fixture.id,
      ...profile.decode(packet.data, fixture.patch.address)
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
