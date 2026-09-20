import dgram from "node:dgram";
import assert from "node:assert/strict";

const PORT = 6454;
const TARGET = "127.0.0.1";

function buildArtDmx(universe, sequence, frame) {
  const packet = Buffer.alloc(18 + 512);
  packet.write("Art-Net\0", 0, "ascii");
  packet.writeUInt16LE(0x5000, 8);
  packet.writeUInt16BE(14, 10);
  packet[12] = sequence;
  packet[13] = 0;
  packet.writeUInt16LE(universe - 1, 14);
  packet.writeUInt16BE(512, 16);
  Buffer.from(frame.slice(0, 512)).copy(packet, 18);
  return packet;
}

function parseArtDmx(packet) {
  assert.equal(packet.subarray(0, 8).toString("ascii"), "Art-Net\0");
  assert.equal(packet.readUInt16LE(8), 0x5000);
  assert.ok(packet.readUInt16BE(10) >= 14);
  const length = Math.min(packet.readUInt16BE(16), 512);
  return {
    universe: packet.readUInt16LE(14) + 1,
    sequence: packet[12],
    data: [...packet.subarray(18, 18 + length)]
  };
}

function decodeRgbwPar(packet, address = 1) {
  const offset = address - 1;
  const [dimmer, red, green, blue, white] = packet.data.slice(offset, offset + 5);
  const channel = (value) => Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, "0");

  return {
    intensity: dimmer / 255,
    color: "#" + channel(red + white) + channel(green + white) + channel(blue + white),
    beamAngle: 28
  };
}

const receiver = dgram.createSocket("udp4");
const sender = dgram.createSocket("udp4");

const received = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("Timed out waiting for Art-Net loopback.")), 2000);

  receiver.once("message", (message) => {
    clearTimeout(timeout);
    resolve(parseArtDmx(message));
  });

  receiver.once("error", reject);
});

await new Promise((resolve, reject) => {
  receiver.once("listening", resolve);
  receiver.once("error", reject);
  receiver.bind(PORT, TARGET);
});

const frame = Array(512).fill(0);
frame.splice(0, 5, 128, 255, 64, 0, 16);

const packet = buildArtDmx(1, 7, frame);

await new Promise((resolve, reject) => {
  sender.send(packet, PORT, TARGET, (error) => error ? reject(error) : resolve());
});

const parsed = await received;
const fixture = decodeRgbwPar(parsed);

assert.equal(parsed.universe, 1);
assert.equal(parsed.sequence, 7);
assert.ok(Math.abs(fixture.intensity - (128 / 255)) < 0.000001);
assert.equal(fixture.color, "#ff5010");

console.log(JSON.stringify({
  status: "PASS",
  transport: "UDP loopback",
  universe: parsed.universe,
  sequence: parsed.sequence,
  fixture: {
    id: "front-wash-1",
    ...fixture
  },
  monitor: "The normalized fixture state is ready for the LumaViz renderer."
}, null, 2));

receiver.close();
sender.close();
