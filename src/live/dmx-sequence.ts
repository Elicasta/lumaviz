export type DmxNetworkProtocol = "artnet" | "sacn";

export class DmxSequenceGate {
  private last = new Map<string, number>();

  accept(protocol: DmxNetworkProtocol, source: string, universe: number, sequence: number) {
    if (!Number.isInteger(sequence) || sequence < 0 || sequence > 255) return false;
    if (protocol === "artnet" && sequence === 0) return true;

    const key = protocol + ":" + source + ":" + universe;
    const previous = this.last.get(key);
    if (previous === undefined) {
      this.last.set(key, sequence);
      return true;
    }

    const delta = (sequence - previous + 256) % 256;
    if (delta === 0 || delta > 127) return false;
    this.last.set(key, sequence);
    return true;
  }

  reset() {
    this.last.clear();
  }
}
