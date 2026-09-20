import { useEffect, useMemo, useRef, useState } from "react";
import { FIXTURE_PROFILES } from "./fixtures/profiles";
import { fixtureFrameFromDmxPacket } from "./live/artnet";
import { connectToLumaRig, type LumaRigConnection } from "./live/lumarig";
import { startArtNetReceiver } from "./live/tauriArtNet";
import { startSacnReceiver } from "./live/tauriSacn";
import { DEFAULT_DIMENSIONS, DEFAULT_FIXTURES } from "./viz/defaults";
import { LumaVizScene } from "./viz/scene";
import type {
  FixtureDefinition,
  FixtureFrame,
  MaterialPreset,
  SceneDimensions,
  SelectionSnapshot,
  TransformTool,
  UnitSystem,
  ViewPreset
} from "./viz/types";
import { displayDistance, inputDistance } from "./viz/units";

type PageId = "build" | "patch" | "visualize" | "cameras" | "connect" | "monitor";
type InputSource = "demo" | "lumarig" | "artnet" | "sacn" | "none";
type ConnectionState = "idle" | "connecting" | "connected" | "error";

const PAGES: Array<{ id: PageId; label: string; description: string }> = [
  { id: "build", label: "BUILD", description: "Venue, stage, truss, objects" },
  { id: "patch", label: "PATCH", description: "Fixtures, universes, addresses" },
  { id: "visualize", label: "VISUALIZE", description: "Main 3D environment" },
  { id: "cameras", label: "CAMERAS", description: "Production viewpoints" },
  { id: "connect", label: "CONNECT", description: "LumaRig and network DMX" },
  { id: "monitor", label: "MONITOR", description: "Clean output" }
];

const CAMERA_VIEWS: Array<{ id: ViewPreset; label: string; description: string }> = [
  { id: "foh", label: "FOH", description: "Operator position looking at stage" },
  { id: "crowd", label: "CROWD", description: "Stage looking through the room" },
  { id: "stage-left", label: "STAGE LEFT", description: "Production view from stage left" },
  { id: "stage-right", label: "STAGE RIGHT", description: "Production view from stage right" },
  { id: "backstage", label: "BACKSTAGE", description: "Rear stage toward audience" },
  { id: "top", label: "TOP", description: "Plan view for focus and spacing" },
  { id: "free", label: "FREE", description: "Orbit, zoom and inspect manually" }
];

const DIMENSION_FIELDS: Array<[keyof SceneDimensions, string]> = [
  ["roomWidth", "Room Width"],
  ["roomDepth", "Room Depth"],
  ["ceilingHeight", "Ceiling Height"],
  ["stageWidth", "Stage Width"],
  ["stageDepth", "Stage Depth"],
  ["stageHeight", "Stage Height"],
  ["screenWidth", "Screen Width"],
  ["screenHeight", "Screen Height"],
  ["screenBottom", "Screen Bottom"],
  ["drapeWidth", "Drape Width"],
  ["drapeHeight", "Drape Height"]
];

function cloneFixtures(): FixtureDefinition[] {
  return DEFAULT_FIXTURES.map((fixture) => ({
    ...fixture,
    position: { ...fixture.position },
    rotation: { ...fixture.rotation },
    patch: { ...fixture.patch }
  }));
}

function makeFixture(index: number): FixtureDefinition {
  return {
    id: "fixture-" + Date.now() + "-" + index,
    name: "Fixture " + index,
    kind: "par",
    position: { x: 0, y: 2.7, z: 1.5 },
    rotation: { x: -35, y: 0, z: 0 },
    patch: {
      enabled: true,
      universe: 1,
      address: 1,
      profileId: "generic-rgbw-par-5ch"
    }
  };
}

function isViewportPage(page: PageId): boolean {
  return page === "build" || page === "visualize" || page === "cameras" || page === "monitor";
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<LumaVizScene | null>(null);
  const cleanupRef = useRef<null | (() => void | Promise<void>)>(null);
  const directRef = useRef<LumaRigConnection | null>(null);
  const lastFrameRef = useRef<FixtureFrame | null>(null);

  const [page, setPage] = useState<PageId>("visualize");
  const [dimensions, setDimensions] = useState<SceneDimensions>({ ...DEFAULT_DIMENSIONS });
  const [fixtures, setFixtures] = useState<FixtureDefinition[]>(cloneFixtures);
  const fixturesRef = useRef<FixtureDefinition[]>(fixtures);
  const [material, setMaterial] = useState<MaterialPreset>("production-dark");
  const [units, setUnits] = useState<UnitSystem>("ft");
  const [activeView, setActiveView] = useState<ViewPreset>("foh");
  const [tool, setTool] = useState<TransformTool>("select");
  const [selected, setSelected] = useState<SelectionSnapshot | null>(null);
  const [sceneVersion, setSceneVersion] = useState(1);
  const [source, setSource] = useState<InputSource>("demo");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connected");
  const [connectionMessage, setConnectionMessage] = useState("Internal demo source");
  const [lumaRigUrl, setLumaRigUrl] = useState("ws://127.0.0.1:9460/lumaviz");
  const [lastPacketSource, setLastPacketSource] = useState("");

  useEffect(() => {
    fixturesRef.current = fixtures;
  }, [fixtures]);

  useEffect(() => {
    if (!isViewportPage(page) || !canvasRef.current) return;

    const viz = new LumaVizScene(
      canvasRef.current,
      dimensions,
      fixtures,
      material,
      setSelected
    );

    sceneRef.current = viz;
    viz.setTool(tool);
    viz.setView(activeView);
    if (lastFrameRef.current) viz.applyFrame(lastFrameRef.current);

    return () => {
      if (sceneRef.current === viz) sceneRef.current = null;
      viz.dispose();
    };
  }, [page, dimensions, fixtures, material, sceneVersion]);

  useEffect(() => {
    sceneRef.current?.setView(activeView);
  }, [activeView]);

  useEffect(() => {
    sceneRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    if (source !== "demo") return;

    let raf = 0;
    const tick = () => {
      const viz = sceneRef.current;
      if (viz) viz.applyFrame(viz.demoFrame(performance.now() / 1000));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [source, page, sceneVersion, dimensions, fixtures, material]);

  useEffect(() => {
    return () => {
      void cleanupConnection();
    };
  }, []);

  const patchedUniverses = useMemo(
    () => Array.from(new Set(
      fixtures
        .filter((fixture) => fixture.patch.enabled)
        .map((fixture) => fixture.patch.universe)
    )).sort((a, b) => a - b),
    [fixtures]
  );

  async function cleanupConnection() {
    const cleanup = cleanupRef.current;
    cleanupRef.current = null;

    if (cleanup) {
      await cleanup();
    }

    directRef.current?.close();
    directRef.current = null;
  }

  function applyFrame(frame: FixtureFrame) {
    lastFrameRef.current = frame;
    sceneRef.current?.applyFrame(frame);
  }

  async function useDemoSource() {
    await cleanupConnection();
    setSource("demo");
    setConnectionState("connected");
    setConnectionMessage("Internal demo source");
    setLastPacketSource("");
  }

  async function connectArtNet() {
    await cleanupConnection();
    setSource("artnet");
    setConnectionState("connecting");
    setConnectionMessage("Listening on UDP 6454");

    const cleanup = await startArtNetReceiver(
      (packet) => {
        setConnectionState("connected");
        setConnectionMessage("Receiving Art-Net · Universe " + packet.universe);
        setLastPacketSource(packet.source);
        applyFrame(fixtureFrameFromDmxPacket(packet, fixturesRef.current, "artnet"));
      },
      (message) => {
        setConnectionState("error");
        setConnectionMessage(message);
      }
    );

    cleanupRef.current = cleanup;
    if (!cleanup) setConnectionState("error");
  }

  async function connectSacn() {
    await cleanupConnection();
    setSource("sacn");
    setConnectionState("connecting");
    setConnectionMessage("Joining sACN universes " + patchedUniverses.join(", "));

    const cleanup = await startSacnReceiver(
      patchedUniverses.length ? patchedUniverses : [1],
      (packet) => {
        setConnectionState("connected");
        setConnectionMessage("Receiving sACN · Universe " + packet.universe);
        setLastPacketSource(packet.source);
        applyFrame(fixtureFrameFromDmxPacket(packet, fixturesRef.current, "sacn"));
      },
      (message) => {
        setConnectionState("error");
        setConnectionMessage(message);
      }
    );

    cleanupRef.current = cleanup;
    if (!cleanup) setConnectionState("error");
  }

  async function connectDirect() {
    await cleanupConnection();
    setSource("lumarig");
    setConnectionState("connecting");
    setConnectionMessage("Connecting to LumaRig session");

    const connection = connectToLumaRig(lumaRigUrl, {
      onOpen: () => {
        setConnectionState("connected");
        setConnectionMessage("LumaRig Direct connected");
        setLastPacketSource(lumaRigUrl);
      },
      onFrame: (frame) => {
        applyFrame(frame);
      },
      onClose: () => {
        setConnectionState("idle");
        setConnectionMessage("LumaRig session disconnected");
      },
      onError: (message) => {
        setConnectionState("error");
        setConnectionMessage(message);
      }
    });

    directRef.current = connection;
    cleanupRef.current = () => connection.close();
  }

  async function disconnect() {
    await cleanupConnection();
    setSource("none");
    setConnectionState("idle");
    setConnectionMessage("No input source");
    setLastPacketSource("");
  }

  function saveScene() {
    localStorage.setItem("lumaviz.scene", JSON.stringify({
      version: 1,
      dimensions,
      fixtures,
      material,
      activeView
    }));
  }

  function openScene() {
    const raw = localStorage.getItem("lumaviz.scene");
    if (!raw) return;

    const saved = JSON.parse(raw) as {
      dimensions?: SceneDimensions;
      fixtures?: FixtureDefinition[];
      material?: MaterialPreset;
      activeView?: ViewPreset;
    };

    if (saved.dimensions) setDimensions(saved.dimensions);
    if (saved.fixtures) setFixtures(saved.fixtures);
    if (saved.material) setMaterial(saved.material);
    if (saved.activeView) setActiveView(saved.activeView);

    setSelected(null);
    setSceneVersion((value) => value + 1);
  }

  function resetScene() {
    setDimensions({ ...DEFAULT_DIMENSIONS });
    setFixtures(cloneFixtures());
    setMaterial("production-dark");
    setActiveView("foh");
    setSelected(null);
    setSceneVersion((value) => value + 1);
  }

  function addFixture() {
    setFixtures((current) => [...current, makeFixture(current.length + 1)]);
  }

  function updateFixture(id: string, update: (fixture: FixtureDefinition) => FixtureDefinition) {
    setFixtures((current) => current.map((fixture) => fixture.id === id ? update(fixture) : fixture));
  }

  function deleteFixture(id: string) {
    setFixtures((current) => current.filter((fixture) => fixture.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function updateDimension(key: keyof SceneDimensions, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;

    setDimensions((current) => ({
      ...current,
      [key]: inputDistance(value, units)
    }));
  }

  function updatePosition(axis: "x" | "y" | "z", raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    sceneRef.current?.updateSelectedPosition(axis, inputDistance(value, units));
  }

  function updateRotation(axis: "x" | "y" | "z", raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    sceneRef.current?.updateSelectedRotation(axis, value);
  }

  function selectFixture(id: string) {
    sceneRef.current?.selectFixture(id);
  }

  function setView(view: ViewPreset) {
    setActiveView(view);
    sceneRef.current?.setView(view);
  }

  async function requestFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  const sourceLabel = source === "lumarig"
    ? "LumaRig Direct"
    : source === "artnet"
      ? "Art-Net"
      : source === "sacn"
        ? "sACN"
        : source === "demo"
          ? "Demo"
          : "Disconnected";

  const connectionClass = connectionState === "connected"
    ? "connected"
    : connectionState === "error"
      ? "error"
      : connectionState === "connecting"
        ? "connecting"
        : "idle";

  return (
    <main className={"app-shell page-" + page}>
      <header className="menu-bar">
        <div className="brand">
          <strong>LumaViz</strong>
          <span>virtual production world</span>
        </div>

        <nav className="primary-nav" aria-label="LumaViz workflow">
          {PAGES.map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => setPage(item.id)}
              title={item.description}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="connection-pill">
          <span className={"status-dot " + connectionClass} />
          <span>{sourceLabel}</span>
        </div>
      </header>

      {page !== "monitor" && (
        <section className="command-bar">
          <div className="command-group">
            <button onClick={resetScene}><span>＋</span><small>NEW</small></button>
            <button onClick={openScene}><span>⌁</span><small>OPEN</small></button>
            <button onClick={saveScene}><span>▣</span><small>SAVE</small></button>
          </div>

          {(page === "build" || page === "visualize") && (
            <>
              <div className="command-divider" />
              <div className="command-group tools">
                {(["select", "move", "rotate"] as TransformTool[]).map((item) => (
                  <button
                    key={item}
                    className={tool === item ? "active" : ""}
                    onClick={() => setTool(item)}
                  >
                    <span>{item === "select" ? "⌁" : item === "move" ? "✥" : "↻"}</span>
                    <small>{item.toUpperCase()}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {(page === "visualize" || page === "cameras" || page === "build") && (
            <div className="camera-tabs">
              {CAMERA_VIEWS.map((view) => (
                <button
                  key={view.id}
                  className={activeView === view.id ? "active" : ""}
                  onClick={() => setView(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
          )}

          <button
            className="unit-switch"
            onClick={() => setUnits((current) => current === "ft" ? "m" : "ft")}
          >
            {units === "ft" ? "FEET" : "METERS"}
          </button>
        </section>
      )}

      {page === "build" && (
        <section className="workspace">
          <aside className="scene-panel">
            <PanelHeading title="BUILD" />
            <div className="tree">
              <TreeStatic icon="▱" label="Venue / Room" />
              <TreeStatic icon="▰" label="Stage" />
              <TreeStatic icon="⌗" label="Truss A" />
              <TreeStatic icon="⌗" label="Truss B" />
              <TreeStatic icon="▭" label="Projection Screen" />
              <TreeStatic icon="▥" label="Back Drape" />
              <TreeStatic icon="◫" label="Production Objects" />
            </div>
            <button className="add-object">＋ ADD OBJECT</button>
          </aside>

          <Viewport
            canvasRef={canvasRef}
            activeView={activeView}
            units={units}
          />

          <aside className="inspector-panel">
            <PanelHeading title="DIMENSIONS" />
            <section className="inspector-section">
              <div className="eyebrow">REAL WORLD SCALE</div>
              <h2>Venue + Stage</h2>
              <p className="muted">Every object uses physical units. Dragging changes position, not the scale model.</p>
            </section>
            <section className="inspector-section dimension-grid">
              {DIMENSION_FIELDS.map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <div>
                    <input
                      value={displayDistance(dimensions[key], units)}
                      onChange={(event) => updateDimension(key, event.target.value)}
                    />
                    <small>{units === "ft" ? "FT" : "M"}</small>
                  </div>
                </label>
              ))}
            </section>
            <section className="inspector-section">
              <h3>MATERIAL ENVIRONMENT</h3>
              <select value={material} onChange={(event) => setMaterial(event.target.value as MaterialPreset)}>
                <option value="production-dark">Production Dark</option>
                <option value="ballroom">Ballroom</option>
                <option value="black-box">Black Box</option>
              </select>
            </section>
          </aside>
        </section>
      )}

      {page === "patch" && (
        <section className="page-content patch-page">
          <div className="page-title-row">
            <div>
              <div className="eyebrow">PATCH</div>
              <h1>Fixtures, universes and addresses</h1>
              <p>LumaViz decodes raw DMX here. LumaRig still owns programming and playback.</p>
            </div>
            <button className="primary-button" onClick={addFixture}>＋ ADD FIXTURE</button>
          </div>

          <div className="patch-table">
            <div className="patch-row patch-head">
              <span>Fixture</span><span>Profile</span><span>Universe</span><span>Address</span><span>Enabled</span><span />
            </div>
            {fixtures.map((fixture) => (
              <div className="patch-row" key={fixture.id}>
                <input
                  value={fixture.name}
                  onChange={(event) => updateFixture(fixture.id, (current) => ({ ...current, name: event.target.value }))}
                />
                <select
                  value={fixture.patch.profileId}
                  onChange={(event) => {
                    const profile = FIXTURE_PROFILES.find((item) => item.id === event.target.value);
                    updateFixture(fixture.id, (current) => ({
                      ...current,
                      kind: profile?.kind ?? current.kind,
                      patch: { ...current.patch, profileId: event.target.value }
                    }));
                  }}
                >
                  {FIXTURE_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  max="63999"
                  value={fixture.patch.universe}
                  onChange={(event) => updateFixture(fixture.id, (current) => ({
                    ...current,
                    patch: { ...current.patch, universe: Math.max(1, Number(event.target.value) || 1) }
                  }))}
                />
                <input
                  type="number"
                  min="1"
                  max="512"
                  value={fixture.patch.address}
                  onChange={(event) => updateFixture(fixture.id, (current) => ({
                    ...current,
                    patch: { ...current.patch, address: Math.max(1, Math.min(512, Number(event.target.value) || 1)) }
                  }))}
                />
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={fixture.patch.enabled}
                    onChange={(event) => updateFixture(fixture.id, (current) => ({
                      ...current,
                      patch: { ...current.patch, enabled: event.target.checked }
                    }))}
                  />
                  <span>{fixture.patch.enabled ? "ON" : "OFF"}</span>
                </label>
                <button className="danger-button" onClick={() => deleteFixture(fixture.id)}>DELETE</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {page === "visualize" && (
        <section className="workspace">
          <aside className="scene-panel">
            <PanelHeading title="SCENE" />
            <div className="tree">
              <TreeStatic icon="▱" label="Room" />
              <TreeStatic icon="▰" label="Stage" />
              <div className="tree-section">
                <div className="tree-label"><span>⌄</span> FIXTURES <small>{fixtures.length}</small></div>
                {fixtures.map((fixture) => (
                  <button
                    key={fixture.id}
                    className={"tree-row fixture-row " + (selected?.id === fixture.id ? "selected" : "")}
                    onClick={() => selectFixture(fixture.id)}
                  >
                    <span className={"fixture-icon " + fixture.kind} />
                    <span>{fixture.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <Viewport canvasRef={canvasRef} activeView={activeView} units={units} />

          <aside className="inspector-panel">
            <PanelHeading title="INSPECTOR" />
            {selected ? (
              <>
                <section className="inspector-section selected-card">
                  <div className="eyebrow">FIXTURE</div>
                  <h2>{selected.name}</h2>
                  <div className="fixture-meta">
                    <span>{selected.kind.replace("-", " ")}</span>
                    <span>U{selected.patch.universe} / {selected.patch.address}</span>
                    <span>{Math.round(selected.intensity * 100)}%</span>
                    <span className="color-chip" style={{ background: selected.color }} />
                  </div>
                </section>
                <section className="inspector-section">
                  <h3>POSITION</h3>
                  <div className="three-inputs">
                    {(["x", "y", "z"] as const).map((axis) => (
                      <label key={axis}>
                        <span>{axis.toUpperCase()}</span>
                        <input
                          value={displayDistance(selected.position[axis], units)}
                          onChange={(event) => updatePosition(axis, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </section>
                <section className="inspector-section">
                  <h3>ROTATION</h3>
                  <div className="three-inputs">
                    {(["x", "y", "z"] as const).map((axis) => (
                      <label key={axis}>
                        <span>{axis.toUpperCase()}</span>
                        <input
                          value={Number(selected.rotation[axis].toFixed(1))}
                          onChange={(event) => updateRotation(axis, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </section>
                <section className="inspector-section data-block">
                  <h3>LIVE INPUT</h3>
                  <dl>
                    <div><dt>Pan</dt><dd>{selected.pan.toFixed(1)}°</dd></div>
                    <div><dt>Tilt</dt><dd>{selected.tilt.toFixed(1)}°</dd></div>
                    <div><dt>Beam</dt><dd>{selected.beamAngle.toFixed(1)}°</dd></div>
                    <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
                  </dl>
                </section>
              </>
            ) : (
              <section className="inspector-section empty-inspector">
                <div className="eyebrow">VISUALIZE</div>
                <h2>Select a fixture</h2>
                <p className="muted">Use the scene tree or click a fixture in the world.</p>
              </section>
            )}
          </aside>
        </section>
      )}

      {page === "cameras" && (
        <section className="workspace cameras-workspace">
          <aside className="scene-panel camera-list">
            <PanelHeading title="PRODUCTION VIEWS" />
            <div className="camera-card-list">
              {CAMERA_VIEWS.map((camera) => (
                <button
                  key={camera.id}
                  className={"camera-card " + (activeView === camera.id ? "active" : "")}
                  onClick={() => setView(camera.id)}
                >
                  <strong>{camera.label}</strong>
                  <span>{camera.description}</span>
                </button>
              ))}
            </div>
            <button className="add-object">＋ SAVE CUSTOM CAMERA</button>
          </aside>

          <Viewport canvasRef={canvasRef} activeView={activeView} units={units} />

          <aside className="inspector-panel">
            <PanelHeading title="CAMERA" />
            <section className="inspector-section">
              <div className="eyebrow">ACTIVE VIEW</div>
              <h2>{CAMERA_VIEWS.find((camera) => camera.id === activeView)?.label}</h2>
              <p className="muted">{CAMERA_VIEWS.find((camera) => camera.id === activeView)?.description}</p>
            </section>
            <section className="inspector-section">
              <h3>PRODUCTION RULE</h3>
              <p className="muted">Preset views should answer production questions quickly. FOH shows the show. Crowd shows coverage. Stage sides show focus. Top shows spacing.</p>
            </section>
          </aside>
        </section>
      )}

      {page === "connect" && (
        <section className="page-content connect-page">
          <div className="page-title-row">
            <div>
              <div className="eyebrow">CONNECT</div>
              <h1>Choose who drives the world</h1>
              <p>One input source at a time. LumaViz renders the last valid state if the source disappears.</p>
            </div>
            <button className="secondary-button" onClick={disconnect}>DISCONNECT</button>
          </div>

          <div className="connection-status-card">
            <span className={"status-dot " + connectionClass} />
            <div>
              <strong>{sourceLabel}</strong>
              <span>{connectionMessage}</span>
              {lastPacketSource && <small>{lastPacketSource}</small>}
            </div>
          </div>

          <div className="connection-grid">
            <ConnectionCard
              title="LumaRig Direct"
              badge="PREFERRED"
              text="Semantic fixture frames over a local or LAN WebSocket session. No DMX decoding needed."
              active={source === "lumarig"}
            >
              <input value={lumaRigUrl} onChange={(event) => setLumaRigUrl(event.target.value)} />
              <button className="primary-button" onClick={connectDirect}>CONNECT LUMARIG</button>
            </ConnectionCard>

            <ConnectionCard
              title="Art-Net"
              badge="UDP 6454"
              text="Listen for ArtDMX from LumaRig or another controller. PATCH converts channels into fixture behavior."
              active={source === "artnet"}
            >
              <div className="protocol-detail">Patched universes: {patchedUniverses.join(", ") || "none"}</div>
              <button className="primary-button" onClick={connectArtNet}>LISTEN FOR ART-NET</button>
            </ConnectionCard>

            <ConnectionCard
              title="sACN / E1.31"
              badge="UDP 5568"
              text="Join multicast groups for the universes used by your patch and render incoming DMX."
              active={source === "sacn"}
            >
              <div className="protocol-detail">Join universes: {patchedUniverses.join(", ") || "1"}</div>
              <button className="primary-button" onClick={connectSacn}>LISTEN FOR sACN</button>
            </ConnectionCard>

            <ConnectionCard
              title="Demo Source"
              badge="LOCAL"
              text="Internal motion and color generator for building the venue when LumaRig is not running."
              active={source === "demo"}
            >
              <button className="secondary-button" onClick={useDemoSource}>USE DEMO</button>
            </ConnectionCard>
          </div>
        </section>
      )}

      {page === "monitor" && (
        <section className="monitor-page">
          <canvas ref={canvasRef} className="viewport monitor-viewport" />
          <div className="monitor-overlay">
            <div>
              <strong>{sourceLabel}</strong>
              <span>{connectionMessage}</span>
            </div>
            <button onClick={requestFullscreen}>FULLSCREEN</button>
          </div>
          <div className="monitor-camera-strip">
            {CAMERA_VIEWS.filter((camera) => camera.id !== "free").map((camera) => (
              <button
                key={camera.id}
                className={activeView === camera.id ? "active" : ""}
                onClick={() => setView(camera.id)}
              >
                {camera.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {page !== "monitor" && (
        <footer className="status-bar">
          <div><span className={"status-dot " + connectionClass} /> {connectionMessage}</div>
          <div>{fixtures.length} fixtures</div>
          <div>{patchedUniverses.length} universe{patchedUniverses.length === 1 ? "" : "s"}</div>
          <div className="status-spacer" />
          <div>v0.1.0</div>
        </footer>
      )}
    </main>
  );
}

function PanelHeading({ title }: { title: string }) {
  return <div className="panel-heading"><span>{title}</span></div>;
}

function TreeStatic({ icon, label }: { icon: string; label: string }) {
  return <button className="tree-row static-row"><span>{icon}</span>{label}</button>;
}

function Viewport({
  canvasRef,
  activeView,
  units
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeView: ViewPreset;
  units: UnitSystem;
}) {
  return (
    <section className="viewport-wrap">
      <canvas ref={canvasRef} className="viewport" />
      <div className="viewport-badge">
        <span>{activeView.toUpperCase().replace("-", " ")}</span>
        <small>{units === "ft" ? "FT" : "M"} · REAL SCALE</small>
      </div>
      <div className="axis-widget" aria-hidden="true">
        <i className="axis y">Y</i>
        <i className="axis x">X</i>
        <i className="axis z">Z</i>
      </div>
    </section>
  );
}

function ConnectionCard({
  title,
  badge,
  text,
  active,
  children
}: {
  title: string;
  badge: string;
  text: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className={"connection-card " + (active ? "active" : "")}>
      <div className="connection-card-head">
        <h2>{title}</h2>
        <span>{badge}</span>
      </div>
      <p>{text}</p>
      <div className="connection-card-actions">{children}</div>
    </article>
  );
}
