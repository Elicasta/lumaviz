import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_DIMENSIONS, DEFAULT_FIXTURES } from "./viz/defaults";
import { LumaVizScene } from "./viz/scene";
import type {
  FixtureDefinition,
  MaterialPreset,
  SceneDimensions,
  SelectionSnapshot,
  TransformTool,
  UnitSystem,
  ViewPreset
} from "./viz/types";
import { displayDistance, inputDistance } from "./viz/units";

const CAMERA_VIEWS: Array<{ id: ViewPreset; label: string }> = [
  { id: "foh", label: "FOH" },
  { id: "stage-left", label: "STAGE LEFT" },
  { id: "stage-right", label: "STAGE RIGHT" },
  { id: "crowd", label: "CROWD" },
  { id: "top", label: "TOP" },
  { id: "backstage", label: "BACKSTAGE" },
  { id: "free", label: "FREE" }
];

const DIMENSION_FIELDS: Array<[keyof SceneDimensions, string]> = [
  ["roomWidth", "Room Width"],
  ["roomDepth", "Room Depth"],
  ["ceilingHeight", "Ceiling"],
  ["stageWidth", "Stage Width"],
  ["stageDepth", "Stage Depth"],
  ["stageHeight", "Stage Height"],
  ["screenWidth", "Screen Width"],
  ["screenHeight", "Screen Height"],
  ["screenBottom", "Screen Bottom"],
  ["drapeWidth", "Drape Width"],
  ["drapeHeight", "Drape Height"]
];

function cloneDefaults(): SceneDimensions {
  return { ...DEFAULT_DIMENSIONS };
}

function makeFixture(index: number): FixtureDefinition {
  return {
    id: `fixture-${Date.now()}-${index}`,
    name: `Fixture ${index}`,
    kind: "par",
    position: { x: 0, y: 2.7, z: 1.5 },
    rotation: { x: -35, y: 0, z: 0 }
  };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<LumaVizScene | null>(null);

  const [dimensions, setDimensions] = useState<SceneDimensions>(cloneDefaults);
  const [fixtures, setFixtures] = useState<FixtureDefinition[]>(() =>
    DEFAULT_FIXTURES.map((fixture) => ({
      ...fixture,
      position: { ...fixture.position },
      rotation: { ...fixture.rotation }
    }))
  );
  const [material, setMaterial] = useState<MaterialPreset>("production-dark");
  const [units, setUnits] = useState<UnitSystem>("ft");
  const [activeView, setActiveView] = useState<ViewPreset>("foh");
  const [tool, setTool] = useState<TransformTool>("select");
  const [selected, setSelected] = useState<SelectionSnapshot | null>(null);
  const [demo, setDemo] = useState(true);
  const [linkState, setLinkState] = useState<"demo" | "waiting" | "connected">("demo");
  const [sceneVersion, setSceneVersion] = useState(1);

  useEffect(() => {
    if (!canvasRef.current) return;
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

    return () => {
      sceneRef.current = null;
      viz.dispose();
    };
  }, [dimensions, fixtures, material, sceneVersion]);

  useEffect(() => {
    sceneRef.current?.setView(activeView);
  }, [activeView]);

  useEffect(() => {
    sceneRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    if (!demo) return;
    let raf = 0;
    const tick = () => {
      const viz = sceneRef.current;
      if (viz) viz.applyFrame(viz.demoFrame(performance.now() / 1000));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demo, sceneVersion, dimensions, fixtures, material]);

  const selectedFixture = useMemo(
    () => selected ? fixtures.find((fixture) => fixture.id === selected.id) : null,
    [fixtures, selected]
  );

  function resetScene() {
    localStorage.removeItem("lumaviz.scene");
    setDimensions(cloneDefaults());
    setFixtures(DEFAULT_FIXTURES.map((fixture) => ({
      ...fixture,
      position: { ...fixture.position },
      rotation: { ...fixture.rotation }
    })));
    setMaterial("production-dark");
    setActiveView("foh");
    setSelected(null);
    setSceneVersion((value) => value + 1);
  }

  function saveScene() {
    localStorage.setItem("lumaviz.scene", JSON.stringify({
      version: 1,
      dimensions,
      fixtures,
      material
    }));
  }

  function openScene() {
    const raw = localStorage.getItem("lumaviz.scene");
    if (!raw) return;
    const saved = JSON.parse(raw) as {
      dimensions?: SceneDimensions;
      fixtures?: FixtureDefinition[];
      material?: MaterialPreset;
    };
    if (saved.dimensions) setDimensions(saved.dimensions);
    if (saved.fixtures) setFixtures(saved.fixtures);
    if (saved.material) setMaterial(saved.material);
    setSelected(null);
    setSceneVersion((value) => value + 1);
  }

  function addFixture() {
    setFixtures((current) => [...current, makeFixture(current.length + 1)]);
  }

  function selectFixture(id: string) {
    sceneRef.current?.selectFixture(id);
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

  function setView(view: ViewPreset) {
    setActiveView(view);
    sceneRef.current?.setView(view);
  }

  const unitLabel = units === "ft" ? "FT" : "M";

  return (
    <main className="app-shell">
      <header className="menu-bar">
        <div className="brand">LumaViz</div>
        <nav className="app-menu" aria-label="Application menu">
          <button>File</button>
          <button>Edit</button>
          <button>View</button>
          <button>Fixtures</button>
          <button>Help</button>
        </nav>
        <div className="connection-pill">
          <span className={`status-dot ${linkState}`} />
          {linkState === "connected" ? "LumaRig Connected" : linkState === "demo" ? "Demo Source" : "Waiting for LumaRig"}
        </div>
      </header>

      <section className="command-bar">
        <div className="command-group">
          <button onClick={resetScene} title="New scene">＋ <span>NEW</span></button>
          <button onClick={openScene} title="Open last saved scene">⌁ <span>OPEN</span></button>
          <button onClick={saveScene} title="Save scene locally">▣ <span>SAVE</span></button>
        </div>

        <div className="command-divider" />

        <div className="command-group tools">
          {(["select", "move", "rotate"] as TransformTool[]).map((item) => (
            <button
              key={item}
              className={tool === item ? "active" : ""}
              onClick={() => setTool(item)}
            >
              {item === "select" ? "⌁" : item === "move" ? "✥" : "↻"}
              <span>{item.toUpperCase()}</span>
            </button>
          ))}
        </div>

        <div className="camera-tabs" aria-label="Camera presets">
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

        <button
          className="unit-switch"
          onClick={() => setUnits((current) => current === "ft" ? "m" : "ft")}
        >
          UNITS: {units === "ft" ? "FEET" : "METERS"}
        </button>
      </section>

      <section className="workspace">
        <aside className="scene-panel">
          <div className="panel-heading">
            <span>SCENE</span>
            <button onClick={addFixture}>＋</button>
          </div>

          <div className="tree">
            <button className="tree-row static-row"><span>▱</span> Room</button>
            <button className="tree-row static-row"><span>▰</span> Stage</button>
            <button className="tree-row static-row"><span>▭</span> Screen</button>
            <button className="tree-row static-row"><span>▥</span> Drape</button>

            <div className="tree-section">
              <div className="tree-label"><span>⌄</span> Fixtures <small>{fixtures.length}</small></div>
              {fixtures.map((fixture) => (
                <button
                  key={fixture.id}
                  className={`tree-row fixture-row ${selected?.id === fixture.id ? "selected" : ""}`}
                  onClick={() => selectFixture(fixture.id)}
                >
                  <span className={`fixture-icon ${fixture.kind}`} />
                  <span>{fixture.name}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="add-object" onClick={addFixture}>＋ ADD FIXTURE</button>
        </aside>

        <section className="viewport-wrap">
          <canvas ref={canvasRef} className="viewport" />

          <div className="viewport-badge">
            <span>{activeView.toUpperCase().replace("-", " ")}</span>
            <small>{unitLabel} • REAL SCALE</small>
          </div>

          <div className="axis-widget" aria-hidden="true">
            <i className="axis y">Y</i>
            <i className="axis x">X</i>
            <i className="axis z">Z</i>
          </div>
        </section>

        <aside className="inspector-panel">
          <div className="panel-heading">
            <span>INSPECTOR</span>
          </div>

          {selected ? (
            <>
              <section className="inspector-section selected-card">
                <div className="eyebrow">FIXTURE</div>
                <h2>{selected.name}</h2>
                <div className="fixture-meta">
                  <span>{selected.kind.replace("-", " ")}</span>
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
                <h3>LIVE STATE</h3>
                <dl>
                  <div><dt>Pan</dt><dd>{selected.pan.toFixed(1)}°</dd></div>
                  <div><dt>Tilt</dt><dd>{selected.tilt.toFixed(1)}°</dd></div>
                  <div><dt>Beam</dt><dd>{selected.beamAngle.toFixed(1)}°</dd></div>
                  <div><dt>Profile</dt><dd>Placeholder</dd></div>
                </dl>
              </section>
            </>
          ) : (
            <>
              <section className="inspector-section">
                <div className="eyebrow">VENUE</div>
                <h2>Scene Dimensions</h2>
                <p className="muted">Every object is rendered in real units. Dragging never replaces dimensional values.</p>
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
                      <small>{unitLabel}</small>
                    </div>
                  </label>
                ))}
              </section>

              <section className="inspector-section">
                <h3>MATERIAL PRESET</h3>
                <select
                  value={material}
                  onChange={(event) => setMaterial(event.target.value as MaterialPreset)}
                >
                  <option value="production-dark">Production Dark</option>
                  <option value="ballroom">Ballroom</option>
                  <option value="black-box">Black Box</option>
                </select>
              </section>
            </>
          )}
        </aside>
      </section>

      <footer className="status-bar">
        <div>
          <span className="status-dot ready" />
          Renderer Ready
        </div>
        <div>{fixtures.length} fixtures</div>
        <div className="status-spacer" />
        <label className="demo-toggle">
          <input
            type="checkbox"
            checked={demo}
            onChange={(event) => {
              setDemo(event.target.checked);
              setLinkState(event.target.checked ? "demo" : "waiting");
            }}
          />
          DEMO MOTION
        </label>
        <div>Scene v{sceneVersion}</div>
      </footer>
    </main>
  );
}
