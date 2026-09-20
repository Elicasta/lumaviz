import { PROFILE_BY_ID } from "../fixtures/profiles";
import type {
  ArtNetDmxPacket,
  FixtureDefinition,
  FixtureFrame
} from "../viz/types";

export function fixtureFrameFromArtNet(
  packet: ArtNetDmxPacket,
  fixtures: FixtureDefinition[]
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
    showId: "artnet",
    sequence: packet.sequence || Date.now(),
    timestamp: Date.now(),
    fixtures: states
  };
}
