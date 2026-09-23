import { useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { connectVizBridge } from "./live/vizbridge";
import { FIXTURE_PROFILES, registerFixtureProfile } from "./fixtures/profiles";
import { importGdtfFile } from "./fixtures/gdtf";
import { validatePatch } from "./fixtures/patch-validation";
import { LOCATION_PRESETS } from "./locations/presets";
import { connectStudioMedia, type DisplaySurface, type StudioMediaFrame } from "./live/lumastudio";
import { fixtureFrameFromDmxPacket } from "./live/artnet";
import { connectToLumaRig, type LumaRigConnection } from "./live/lumarig";
import { startArtNetReceiver } from "./live/tauriArtNet";
import { startSacnReceiver } from "./live/tauriSacn";
import { parseSceneFile } from "./viz/scene-file";
import { DEFAULT_DIMENSIONS, DEFAULT_FIXTURES, DEFAULT_OBJECTS } from "./viz/defaults";
import { LumaVizScene } from "./viz/scene";
import type {
  CustomCamera,
  FixtureDefinition,
  FixtureFrame,
  MaterialPreset,
  SceneDimensions,
  SceneObject,
  SelectionSnapshot,
  TransformTool,
  UnitSystem,
  ViewPreset
} from "./viz/types";
import { displayDistance, inputDistance } from "./viz/units";
import { isSharedShowActivation } from "./core/shared-show";
import { canAutoApplyStageChange, stageChangeConflicts, type StageChange, type StageSyncMode } from "./core/stage-sync";

type PageId = "build" | "patch" | "visualize" | "cameras" | "screens" | "connect" | "library" | "monitor";
type InputSource = "demo" | "lumarig" | "vizbridge" | "artnet" | "sacn" | "none";
type ConnectionState = "idle" | "connecting" | "connected" | "error";

const PAGES: Array<{ id: PageId; label: string; description: string }> = [
  { id: "build", label: "STAGE / VENUE", description: "Venue preset, stage, dimensions, truss and objects" },
  { id: "patch", label: "PATCH", description: "Fixtures, universes, addresses" },
  { id: "visualize", label: "VISUALIZE", description: "Main 3D environment" },
  { id: "cameras", label: "CAMERAS", description: "Production viewpoints" },
  { id: "screens", label: "SCREENS", description: "Displays and Studio media" },
  { id: "connect", label: "CONNECT", description: "LumaRig and network DMX" },
  { id: "library", label: "LIBRARY", description: "Shared templates and service shows" },
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

function cloneObjects(): SceneObject[] {
  return DEFAULT_OBJECTS.map((object) => ({
    ...object,
    position: { ...object.position },
    rotation: { ...object.rotation },
    size: { ...object.size }
  }));
}

function loadDisplaySurfaces(): DisplaySurface[] {
  try {
    const raw=localStorage.getItem("lumaviz.display-surfaces");
    if(!raw)return [];
    const parsed=JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function resolveStudioMediaSource(frame: StudioMediaFrame | null, outputId: string): { url?: string; label: string; supported: boolean } {
  if(!frame || frame.outputId!==outputId) return { label:"Waiting for Studio output", supported:true };
  if(frame.program?.state==="black") return { label:"Program black", supported:true };
  if(frame.program?.state==="clear") return { label:"Program clear", supported:true };
  const clips=frame.program?.clips?.filter(clip=>clip.enabled) ?? [];
  const position=frame.positionSeconds;
  const active=[...clips].reverse().find(clip=>{
    if(clip.playbackMode==="section" && clip.sectionId && clip.sectionId!==frame.sectionId) return false;
    const elapsed=position-clip.timelineStartSeconds;
    if(elapsed<0)return false;
    if(clip.sourceOutSeconds!==undefined) return elapsed <= Math.max(0,clip.sourceOutSeconds-clip.sourceInSeconds);
    return true;
  });
  if(!active) return { label:"No active Studio clip", supported:true };
  if(active.source.kind==="youtube") return { label:active.name+" · YouTube preview pending", supported:false };
  try {
    return { url:convertFileSrc(active.source.path), label:active.name, supported:true };
  } catch {
    return { label:active.name+" · local file unavailable", supported:false };
  }
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
      profileId: "generic-rgbw-par",
      modeId: "5ch-drgbw"
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
  const cameraSnapshotRef = useRef<CustomCamera | null>(null);

  const [page, setPage] = useState<PageId>("visualize");
  const [dimensions, setDimensions] = useState<SceneDimensions>({ ...DEFAULT_DIMENSIONS });
  const [fixtures, setFixtures] = useState<FixtureDefinition[]>(cloneFixtures);
  const [objects, setObjects] = useState<SceneObject[]>(cloneObjects);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const fixturesRef = useRef<FixtureDefinition[]>(fixtures);
  const [material, setMaterial] = useState<MaterialPreset>("production-dark");
  const [units, setUnits] = useState<UnitSystem>("ft");
  const [activeView, setActiveView] = useState<ViewPreset>("foh");
  const [customCameras, setCustomCameras] = useState<CustomCamera[]>([]);
  const [activeCustomCameraId, setActiveCustomCameraId] = useState<string | null>(null);
  const [tool, setTool] = useState<TransformTool>("select");
  const [visualizerMode, setVisualizerMode] = useState<"3d" | "2d">("3d");
  const [browserTab, setBrowserTab] = useState<"fixtures" | "groups" | "scene" | "views">("fixtures");
  const [inspectorTab, setInspectorTab] = useState<"properties" | "dmx" | "live">("properties");
  const [fixtureSearch, setFixtureSearch] = useState("");
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(0.25);
  const [selected, setSelected] = useState<SelectionSnapshot | null>(null);
  const [sceneVersion, setSceneVersion] = useState(1);
  const [source, setSource] = useState<InputSource>("artnet");
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("Starting automatic LumaRig link · UDP 6454");
  const [lumaRigUrl, setLumaRigUrl] = useState("ws://127.0.0.1:9460/lumaviz");
  const [lastPacketSource, setLastPacketSource] = useState("");
  const [packetCount, setPacketCount] = useState(0);
  const [matchedFixtureCount, setMatchedFixtureCount] = useState(0);
  const [sharedShowRevision, setSharedShowRevision] = useState(1);
  const sharedShowRevisionRef=useRef(1);
  const [sharedShowName, setSharedShowName] = useState("Local Scene");
  const [sharedShowLibrary, setSharedShowLibrary] = useState<Array<{id:string;name:string;savedAt:string;status:string}>>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [stageSyncMode,setStageSyncMode]=useState<StageSyncMode>("review");
  const [stageRevision,setStageRevision]=useState(1);
  const [stageChanges,setStageChanges]=useState<StageChange[]>([]);
  const stageSyncModeRef=useRef<StageSyncMode>("review");
  const stageRevisionRef=useRef(1);
  const pendingStageChanges=stageChanges.filter(change=>change.status==="pending"||change.status==="conflict");
  const [studioFrame,setStudioFrame]=useState<StudioMediaFrame|null>(null);
  const [studioMediaState,setStudioMediaState]=useState<"offline"|"connected">("offline");
  const [displaySurfaces,setDisplaySurfaces]=useState<DisplaySurface[]>(loadDisplaySurfaces);

  useEffect(()=>{ let stop:(()=>void)|undefined; void connectStudioMedia("local://lumastudio-media",{onOpen:()=>setStudioMediaState("connected"),onClose:()=>setStudioMediaState("offline"),onFrame:setStudioFrame}).then(unlisten=>{stop=unlisten;}); return()=>stop?.(); },[]);

  useEffect(()=>{ localStorage.setItem("lumaviz.display-surfaces",JSON.stringify(displaySurfaces)); },[displaySurfaces]);
  useEffect(()=>{ sharedShowRevisionRef.current=sharedShowRevision; },[sharedShowRevision]);
  useEffect(()=>{ stageSyncModeRef.current=stageSyncMode; },[stageSyncMode]);
  useEffect(()=>{ stageRevisionRef.current=stageRevision; },[stageRevision]);

  useEffect(() => {
    fixturesRef.current = fixtures;
  }, [fixtures]);

  const sceneTopology = JSON.stringify([fixtures.map(item => [item.id, item.kind]), objects.map(item => [item.id, item.kind])]);
  const resetCameraOnRebuild = useRef(false);
  useEffect(() => {
    if (!isViewportPage(page) || !canvasRef.current) return;

    const viz = new LumaVizScene(
      canvasRef.current,
      dimensions,
      fixtures,
      objects,
      material,
      setSelected,
      (transformed) => {
        const before = fixturesRef.current.find((fixture) => fixture.id === transformed.id);
        fixturesRef.current = fixturesRef.current.map((fixture) =>
          fixture.id === transformed.id ? transformed : fixture
        );
        setFixtures((current) => current.map((fixture) =>
          fixture.id === transformed.id ? transformed : fixture
        ));
        if (before && directRef.current) {
          directRef.current.sendStageChange({
            id: "lumaviz-" + Date.now() + "-" + transformed.id,
            entityId: transformed.id,
            entityKind: "fixture",
            category: "fixturePosition",
            source: "lumaviz",
            baseRevision: stageRevisionRef.current,
            createdAt: new Date().toISOString(),
            summary: transformed.name + " position / rotation",
            before: { position: before.position, rotation: before.rotation },
            after: { position: transformed.position, rotation: transformed.rotation },
            status: "pending"
          });
          const nextRevision=stageRevisionRef.current+1;
          stageRevisionRef.current=nextRevision;
          setStageRevision(nextRevision);
        }
      },
      (transformedObject) => {
        setObjects((current)=>current.map((object)=>object.id===transformedObject.id ? {
          ...transformedObject,
          position:{...transformedObject.position},
          rotation:{...transformedObject.rotation},
          size:{...transformedObject.size}
        } : object));
        if(directRef.current){
          directRef.current.sendStageChange({
            id:"lumaviz-"+Date.now()+"-"+transformedObject.id,
            entityId:transformedObject.id,
            entityKind:"object",
            category:"scenery",
            source:"lumaviz",
            baseRevision:stageRevisionRef.current,
            createdAt:new Date().toISOString(),
            summary:transformedObject.name+" position / rotation",
            before:null,
            after:{position:transformedObject.position,rotation:transformedObject.rotation,size:transformedObject.size},
            status:"pending" as const
          });
          const nextRevision=stageRevisionRef.current+1;
          stageRevisionRef.current=nextRevision;
          setStageRevision(nextRevision);
        }
      },
      setSelectedObjectId
    );

    sceneRef.current = viz;
    if (resetCameraOnRebuild.current) { cameraSnapshotRef.current = null; resetCameraOnRebuild.current = false; }
    viz.setTool(tool);
    viz.setSnap(snapEnabled, snapStep);
    if (visualizerMode === "2d") {
      if (cameraSnapshotRef.current) viz.restoreCamera(cameraSnapshotRef.current);
      viz.setPlanView(true);
    } else if (cameraSnapshotRef.current) {
      viz.restoreCamera(cameraSnapshotRef.current);
    } else {
      const activeCustomCamera = customCameras.find((camera) => camera.id === activeCustomCameraId);
      if (activeCustomCamera) viz.applyCustomCamera(activeCustomCamera);
      else viz.setView(activeView);
    }
    if (lastFrameRef.current) viz.applyFrame(lastFrameRef.current);

    return () => {
      if (!resetCameraOnRebuild.current) cameraSnapshotRef.current = viz.cameraSnapshot();
      if (sceneRef.current === viz) sceneRef.current = null;
      viz.dispose();
    };
  }, [page, dimensions, sceneTopology, material, sceneVersion]);

  // Transform edits update existing meshes. They must not dispose the camera,
  // engine, textures or pointer interaction on every scenery change.
  useEffect(() => {
    for (const object of objects) sceneRef.current?.updateSceneObject(object);
    for (const fixture of fixtures) sceneRef.current?.updateFixtureTransform(fixture.id, fixture.position, fixture.rotation);
  }, [objects, fixtures, page, sceneVersion]);

  useEffect(() => {
    sceneRef.current?.setView(activeView);
  }, [activeView]);

  useEffect(() => {
    sceneRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => { sceneRef.current?.setSnap(snapEnabled, snapStep); }, [snapEnabled, snapStep]);
  useEffect(() => {
    const key=(event:KeyboardEvent)=>{
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
      if ((event.metaKey||event.ctrlKey) && event.key.toLowerCase()==="a") { event.preventDefault(); sceneRef.current?.selectAllFixtures(); }
      if ((event.metaKey||event.ctrlKey) && event.key.toLowerCase()==="d") { event.preventDefault(); duplicateSelected(); }
      if (event.key==="Escape") sceneRef.current?.clearSelection();
    };
    window.addEventListener("keydown",key); return ()=>window.removeEventListener("keydown",key);
  });

  useEffect(() => {
    if (!directRef.current || connectionState !== "connected") return;
    const timer = window.setInterval(() => {
      const canvas = canvasRef.current;
      const direct = directRef.current;
      if (!canvas || !direct || canvas.width < 2 || canvas.height < 2) return;
      try {
        direct.sendPreviewFrame(canvas.toDataURL("image/jpeg", 0.68), activeView);
      } catch {
        // Preview relay is best-effort and must never interrupt visualization or DMX.
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [connectionState, activeView, page]);

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
  }, [source, page, sceneVersion, dimensions, fixtures, objects, material]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (cancelled) return;
      await connectArtNet();
    };
    void start();
    return () => {
      cancelled = true;
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

  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) ?? null,
    [objects, selectedObjectId]
  );

  const patchReport = useMemo(() => validatePatch(fixtures), [fixtures]);
  const displayMedia = useMemo(() => new Map(displaySurfaces.map(surface => [surface.id, resolveStudioMediaSource(studioFrame, surface.sourceOutputId)])), [displaySurfaces, studioFrame]);
  const selectedProfile=useMemo(()=>selected ? FIXTURE_PROFILES.find(profile=>profile.id===selected.patch.profileId) : undefined,[selected]);
  const selectedMode=useMemo(()=>selectedProfile?.modes.find(mode=>mode.id===selected?.patch.modeId) ?? selectedProfile?.modes[0],[selectedProfile,selected]);
  const selectedPatchSpan=useMemo(()=>selected ? patchReport.spans.find(span=>span.fixtureId===selected.id) : undefined,[patchReport,selected]);
  const selectedPatchConflict=useMemo(()=>selected ? patchReport.conflicts.some(conflict=>conflict.fixtures.some(item=>item.id===selected.id)) || patchReport.outOfRange.some(span=>span.fixtureId===selected.id) : false,[patchReport,selected]);

  useEffect(() => {
    const viz=sceneRef.current;
    if(!viz)return;
    const timers:number[]=[];
    for(const surface of displaySurfaces){
      if(!surface.sceneObjectId)continue;
      const media=displayMedia.get(surface.id);
      const apply=()=>viz.setDisplaySurfaceMedia(surface.sceneObjectId!,media?.url,{
        brightness:surface.brightness,
        fit:surface.fit,
        flipX:surface.flipX,
        flipY:surface.flipY,
        rotation:surface.rotation
      });
      if(surface.latencyMs>0)timers.push(window.setTimeout(apply,surface.latencyMs));
      else apply();
    }
    return()=>timers.forEach(timer=>window.clearTimeout(timer));
  },[displaySurfaces,displayMedia,page,sceneVersion]);

  async function cleanupConnection() {
    const cleanup = cleanupRef.current;
    cleanupRef.current = null;

    if (cleanup) {
      await cleanup();
    }

    directRef.current?.close();
    directRef.current = null;
  }

  function loadLocation(locationId:string) {
    const location=LOCATION_PRESETS.find(item=>item.id===locationId); if(!location) return;
    setActiveLocationId(location.id);
    setDimensions({...location.dimensions});
    setObjects(location.objects.map(object=>({...object,position:{...object.position},rotation:{...object.rotation},size:{...object.size}})));
    setFixtures(current => {
      const retained=current.filter(fixture=>!fixture.id.startsWith("ad26-")&&!fixture.id.startsWith("cs-ceiling-"));
      return [...retained,...location.referenceFixtures.map(fixture=>({...fixture,position:{...fixture.position},rotation:{...fixture.rotation},patch:{...fixture.patch,enabled:false}}))];
    });
    setMaterial(location.material);
    setCustomCameras(location.cameras.map(camera=>({...camera,position:{...camera.position},target:{...camera.target}})));
    setSceneVersion(version=>version+1);
    const revision=sharedShowRevisionRef.current+1;
    sharedShowRevisionRef.current=revision;
    setSharedShowRevision(revision);
    directRef.current?.sendStageChange({type:"shared-location.update",source:"lumaviz",revision,location:{id:location.id,name:location.name,version:location.version,estimated:location.estimated,dimensions:location.dimensions,objects:location.objects,cameras:location.cameras}});
  }

  function duplicateSelected() {
    const ids = new Set(sceneRef.current?.getSelectedFixtureIds() ?? (selected ? [selected.id] : []));
    if (!ids.size) return;
    setFixtures((current) => {
      const copies = current.filter(f => ids.has(f.id)).map((f,index) => ({...f,id:`${f.id}-copy-${Date.now()}-${index}`,name:`${f.name} Copy`,position:{...f.position,x:f.position.x+snapStep},rotation:{...f.rotation},patch:{...f.patch,enabled:false}}));
      return [...current,...copies];
    });
  }
  function arraySelected(count=4) {
    const ids = new Set(sceneRef.current?.getSelectedFixtureIds() ?? (selected ? [selected.id] : []));
    if (!ids.size) return;
    setFixtures(current => [...current,...current.filter(f=>ids.has(f.id)).flatMap(f=>Array.from({length:Math.max(0,count-1)},(_,i)=>({...f,id:`${f.id}-array-${Date.now()}-${i}`,name:`${f.name} ${i+2}`,position:{...f.position,x:f.position.x+snapStep*(i+1)},rotation:{...f.rotation},patch:{...f.patch,enabled:false}})))]);
  }
  async function importFixtureFile(file: File) {
    try {
      const profile = await importGdtfFile(file);
      registerFixtureProfile(profile);
      setFixtureSearch(profile.model);
      setConnectionMessage("Fixture profile imported · "+profile.manufacturer+" "+profile.model);
    } catch (error) { console.error(error); }
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

  async function connectBridge() {
    await cleanupConnection();
    setSource("vizbridge");
    setConnectionState("connecting");
    setConnectionMessage("Connecting to VizBridge · ws://127.0.0.1:9461/dmx");
    const cleanup = connectVizBridge("ws://127.0.0.1:9461/dmx", {
      onOpen: () => {
        setConnectionState("connected");
        setConnectionMessage("VizBridge connected · waiting for Art-Net");
      },
      onClose: () => {
        setConnectionState("idle");
        setConnectionMessage("VizBridge disconnected");
      },
      onError: (message) => {
        setConnectionState("error");
        setConnectionMessage(message);
      },
      onPacket: (packet) => {
        setPacketCount((count) => count + 1);
        setLastPacketSource("VizBridge · " + packet.source);
        const frame = fixtureFrameFromDmxPacket(packet, fixturesRef.current, "artnet");
        setMatchedFixtureCount(frame.fixtures.length);
        applyFrame(frame);
      }
    });
    cleanupRef.current = cleanup;
  }

  async function connectArtNet() {
    await cleanupConnection();
    setSource("artnet");
    setConnectionState("connecting");
    setConnectionMessage("Listening on UDP 6454");

    const cleanup = await startArtNetReceiver(
      (packet) => {
        const frame = fixtureFrameFromDmxPacket(packet, fixturesRef.current, "artnet");
        setPacketCount((count) => count + 1);
        setMatchedFixtureCount(frame.fixtures.length);
        setConnectionState("connected");
        setConnectionMessage("LumaRig LIVE · U" + packet.universe + " · " + frame.fixtures.length + " fixture" + (frame.fixtures.length === 1 ? "" : "s") + " matched");
        setLastPacketSource(packet.source);
        applyFrame(frame);
      },
      (message) => {
        setConnectionState("error");
        setConnectionMessage(message);
      },
      (status) => {
        if (status === "listening") {
          setConnectionState("connected");
          setConnectionMessage("AUTO LINK READY · UDP 6454 · waiting for LumaRig");
        } else if (status === "lumarig-handshake") {
          setConnectionState("connected");
          setConnectionMessage("LUMARIG ACKNOWLEDGED · UDP 6454");
        } else if (status === "stopped") {
          setConnectionState((current) => current === "error" ? current : "idle");
          setConnectionMessage((current) => current.includes("Could not bind") ? current : "Art-Net listener stopped");
        }
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


  function normalizeIncomingRotation(value: unknown): {x:number;y:number;z:number}|undefined {
    if(!value || typeof value!=="object")return undefined;
    const rotation=value as Record<string,unknown>;
    if(typeof rotation.x==="number"&&typeof rotation.y==="number"&&typeof rotation.z==="number"){
      return {x:rotation.x,y:rotation.y,z:rotation.z};
    }
    if(typeof rotation.yaw==="number"&&typeof rotation.pitch==="number"&&typeof rotation.roll==="number"){
      return {x:rotation.pitch,y:rotation.yaw,z:rotation.roll};
    }
    return undefined;
  }

  function normalizeIncomingVec3(value: unknown): {x:number;y:number;z:number}|undefined {
    if(!value || typeof value!=="object")return undefined;
    const vector=value as Record<string,unknown>;
    return typeof vector.x==="number"&&typeof vector.y==="number"&&typeof vector.z==="number"
      ? {x:vector.x,y:vector.y,z:vector.z}
      : undefined;
  }

  function stageChangeSupported(change:StageChange):boolean {
    return change.category==="fixturePosition" || change.category==="scenery" || change.category==="patch" || change.category==="fixtureProfile";
  }

  function applyIncomingStageChange(change:StageChange,approved=false):boolean {
    if(!stageChangeSupported(change)){
      setConnectionMessage("Stage Sync · "+change.category+" requires a future model upgrade");
      return false;
    }
    const after=(change.after && typeof change.after==="object" ? change.after : {}) as Record<string,unknown>;
    let applied=false;
    let rebuild=false;

    if(change.entityKind==="fixture" && change.category==="fixturePosition"){
      const position=normalizeIncomingVec3(after.position);
      const rotation=normalizeIncomingRotation(after.rotation);
      if(position||rotation){
        setFixtures(current=>current.map(fixture=>{
          if(fixture.id!==change.entityId)return fixture;
          const next={...fixture,position:position??fixture.position,rotation:rotation??fixture.rotation};
          sceneRef.current?.updateFixtureTransform(fixture.id,next.position,next.rotation);
          return next;
        }));
        applied=true;
      }
    } else if(change.entityKind==="object" && change.category==="scenery"){
      const position=normalizeIncomingVec3(after.position);
      const rotation=normalizeIncomingRotation(after.rotation);
      const size=normalizeIncomingVec3(after.size);
      setObjects(current=>current.map(object=>{
        if(object.id!==change.entityId)return object;
        const next={...object,position:position??object.position,rotation:rotation??object.rotation,size:size??object.size};
        sceneRef.current?.updateSceneObject(next);
        applied=true;
        return next;
      }));
    } else if(change.entityKind==="fixture" && (change.category==="patch"||change.category==="fixtureProfile")){
      setFixtures(current=>current.map(fixture=>{
        if(fixture.id!==change.entityId)return fixture;
        const patchAfter=(after.patch && typeof after.patch==="object" ? after.patch : after) as Record<string,unknown>;
        const profileId=typeof patchAfter.profileId==="string"?patchAfter.profileId:fixture.patch.profileId;
        const modeId=typeof patchAfter.modeId==="string"?patchAfter.modeId:fixture.patch.modeId;
        const profile=FIXTURE_PROFILES.find(item=>item.id===profileId);
        applied=true;
        rebuild=true;
        return {
          ...fixture,
          kind:profile?.kind??fixture.kind,
          patch:{
            ...fixture.patch,
            profileId,
            modeId,
            universe:typeof patchAfter.universe==="number"?patchAfter.universe:fixture.patch.universe,
            address:typeof patchAfter.address==="number"?patchAfter.address:fixture.patch.address,
            enabled:typeof patchAfter.enabled==="boolean"?patchAfter.enabled:fixture.patch.enabled
          }
        };
      }));
    }

    if(!applied)return false;
    const nextRevision=Math.max(stageRevisionRef.current+1,change.baseRevision+1);
    stageRevisionRef.current=nextRevision;
    setStageRevision(nextRevision);
    setStageChanges(current=>current.map(item=>item.id===change.id?{...item,status:approved?("approved" as const):("applied" as const)}:item));
    if(rebuild)setSceneVersion(version=>version+1);
    setConnectionMessage("Stage Sync · "+change.summary+" applied · R"+nextRevision);
    return true;
  }

  function rejectStageChange(id:string){
    setStageChanges(current=>current.map(change=>change.id===id?{...change,status:"rejected" as const}:change));
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
      onSharedShowActivation: (value) => { if (!isSharedShowActivation(value)) return; setSharedShowRevision(value.revision); sharedShowRevisionRef.current=value.revision; setSharedShowName(value.showId); const location=value.locationId?LOCATION_PRESETS.find(item=>item.id===value.locationId):undefined; if (value.locationId&&location) loadLocation(value.locationId); connection.sendSharedShowAck({type:"shared-show.ack",protocol:"shared-show-v1",showId:value.showId,app:"lumaviz",revision:value.revision,state:value.locationId&&!location?"missing":"loaded",detail:value.locationId&&!location?"Location preset missing":"Venue loaded; outputs unchanged",timestamp:Date.now()}); setConnectionMessage(value.locationId&&!location?"Shared show loaded · venue preset missing":"Shared show loaded · outputs unchanged"); },
      onSharedShowConflict: (value) => {
        const conflict = value as { revision?:number; reason?:string };
        if (typeof conflict.revision === "number") { setSharedShowRevision(conflict.revision); sharedShowRevisionRef.current=conflict.revision; }
        setConnectionMessage("Shared show conflict · LumaRig kept newer revision" + (conflict.revision ? " R" + conflict.revision : ""));
      },
      onSharedShowSnapshot: (value) => {
        const snapshot = value as { revision?:number; show?:{id?:string;name?:string}; patch?:Array<{id:string;name:string;profileId:string;modeId:string;universe:number;address:number;group?:string;transform?:{position?:{x:number;y:number;z:number};rotation?:{yaw:number;pitch:number;roll:number}}}>; library?:Array<{id:string;name:string;savedAt:string;status:string}> };
        if (typeof snapshot.revision === "number") { setSharedShowRevision(snapshot.revision); sharedShowRevisionRef.current=snapshot.revision; }
        if (snapshot.show?.name) setSharedShowName(snapshot.show.name);
        if (snapshot.library) setSharedShowLibrary(snapshot.library);
        if (Array.isArray(snapshot.patch)) setFixtures((current) => snapshot.patch!.map((item) => {
          const existing = current.find((fixture) => fixture.id === item.id);
          const profile = FIXTURE_PROFILES.find((candidate) => candidate.id === item.profileId);
          return { id:item.id, name:item.name, kind:profile?.kind ?? existing?.kind ?? "par", position:item.transform?.position ?? existing?.position ?? {x:0,y:2.7,z:1.5}, rotation:item.transform?.rotation ? {x:item.transform.rotation.pitch,y:item.transform.rotation.yaw,z:item.transform.rotation.roll} : existing?.rotation ?? {x:0,y:0,z:0}, patch:{enabled:true,universe:item.universe,address:item.address,profileId:item.profileId,modeId:item.modeId} };
        }));
      },
      onStageChange: (value) => {
        const change=value as StageChange;
        if(!change?.id || !change.entityId || typeof change.baseRevision!=="number")return;
        const conflict=stageChangeConflicts(stageRevisionRef.current,change);
        if(conflict){
          setStageChanges(current=>[{...change,status:"conflict" as const},...current.filter(item=>item.id!==change.id)].slice(0,80));
          setConnectionMessage("Stage Sync conflict · "+change.summary+" · expected R"+stageRevisionRef.current);
          return;
        }
        if(canAutoApplyStageChange(stageSyncModeRef.current,change)){
          setStageChanges(current=>[{...change,status:"pending" as const},...current.filter(item=>item.id!==change.id)].slice(0,80));
          applyIncomingStageChange(change);
          return;
        }
        setStageChanges(current=>[{...change,status:"pending" as const},...current.filter(item=>item.id!==change.id)].slice(0,80));
        setConnectionMessage("Stage Sync · "+change.summary+" awaiting review");
      },
            onFrame: (frame) => {
        setPacketCount((count) => count + 1);
        // LumaRig fixture IDs and LumaViz scene IDs do not have to match. Direct
        // frames carry patch identity, so bind each semantic fixture to the scene
        // fixture at the same universe/address. This prevents a whole fixture's
        // channels from being interpreted as one unrelated LumaViz profile.
        const sceneFixtures = fixturesRef.current;
        const remapped = frame.fixtures.flatMap((state) => {
          const exact = sceneFixtures.find((fixture) => fixture.id === state.id);
          const patched = exact ?? (state.universe !== undefined && state.address !== undefined
            ? sceneFixtures.find((fixture) => fixture.patch.enabled
              && fixture.patch.universe === state.universe
              && fixture.patch.address === state.address)
            : undefined);
          return patched ? [{ ...state, id: patched.id }] : [];
        });
        setMatchedFixtureCount(remapped.length);
        setConnectionState("connected");
        setConnectionMessage("LumaRig Direct LIVE · " + remapped.length + "/" + frame.fixtures.length + " fixtures patch-matched");
        applyFrame({ ...frame, fixtures: remapped });
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
      objects,
      material,
      activeView,
      customCameras,
      activeCustomCameraId,
      displaySurfaces,
      visualizerMode,
      activeLocationId,
      sharedShowName,
      sharedShowRevision,
      stageSyncMode,
      stageRevision
    }));
    setConnectionMessage("Scene saved · "+sharedShowName);
  }

  function openScene() {
    const raw = localStorage.getItem("lumaviz.scene");
    if (!raw) return;

    try {
    const saved = parseSceneFile(raw);
    resetCameraOnRebuild.current = true;
    lastFrameRef.current = null;
    setSelectedObjectId(null);
    setStageChanges([]);
    setDimensions(saved.dimensions ?? { ...DEFAULT_DIMENSIONS });
    setFixtures(saved.fixtures ?? []);
    setObjects(saved.objects ?? []);
    setMaterial(saved.material ?? "production-dark");
    setActiveView(saved.activeView ?? "foh");
    setCustomCameras(saved.customCameras ?? []);
    setActiveCustomCameraId(saved.activeCustomCameraId ?? null);
    setDisplaySurfaces(saved.displaySurfaces ?? []);
    setVisualizerMode(saved.visualizerMode ?? "3d");
    setActiveLocationId(saved.activeLocationId ?? "");
    setSharedShowName(saved.sharedShowName);
    setSharedShowRevision(saved.sharedShowRevision);
    sharedShowRevisionRef.current = saved.sharedShowRevision;
    setStageSyncMode(saved.stageSyncMode);
    setStageRevision(saved.stageRevision);
    stageRevisionRef.current = saved.stageRevision;

    setSelected(null);
    setSceneVersion((value) => value + 1);
    setConnectionMessage("Saved scene replaced current scene · outputs unchanged");
    } catch (error) { setConnectionMessage(`Scene could not be opened: ${String(error)}`); }
  }

  function resetScene() {
    resetCameraOnRebuild.current = true;
    lastFrameRef.current = null;
    setDimensions({ ...DEFAULT_DIMENSIONS });
    setFixtures(cloneFixtures());
    setObjects(cloneObjects());
    setSelectedObjectId(null);
    setMaterial("production-dark");
    setActiveView("foh");
    setCustomCameras([]);
    setActiveCustomCameraId(null);
    setDisplaySurfaces([]);
    setVisualizerMode("3d");
    setActiveLocationId("");
    setSharedShowName("Local Scene");
    setSharedShowRevision(1);
    sharedShowRevisionRef.current=1;
    setStageSyncMode("review");
    setStageRevision(1);
    stageRevisionRef.current=1;
    setStageChanges([]);
    cameraSnapshotRef.current=null;
    setSelected(null);
    setSceneVersion((value) => value + 1);
    setConnectionMessage("New local scene · outputs unchanged");
  }

  function addBuildObject() {
    const index = objects.length + 1;
    const object: SceneObject = {
      id: "object-" + Date.now() + "-" + index,
      name: "Scenic Object " + index,
      kind: "box",
      position: { x: 0, y: 0.5, z: 3 },
      rotation: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1, z: 1 }
    };
    setObjects((current) => [...current, object]);
    setSelectedObjectId(object.id);
  }

  function updateBuildObject(id: string, update: (object: SceneObject) => SceneObject) {
    setObjects((current) => current.map((object) => {
      if(object.id!==id)return object;
      const next=update(object);
      sceneRef.current?.updateSceneObject(next);
      return next;
    }));
  }

  function deleteBuildObject(id: string) {
    setObjects((current) => current.filter((object) => object.id !== id));
    if (selectedObjectId === id) setSelectedObjectId(null);
  }

  function addFixture() {
    setFixtures((current) => [...current, makeFixture(current.length + 1)]);
  }

  function updateFixture(id: string, update: (fixture: FixtureDefinition) => FixtureDefinition) {
    const currentFixture=fixturesRef.current.find(fixture=>fixture.id===id);
    if(!currentFixture)return;
    const next=update(currentFixture);
    const nextFixtures=fixturesRef.current.map(fixture=>fixture.id===id?next:fixture);
    fixturesRef.current=nextFixtures;
    setFixtures(nextFixtures);
    if(selected?.id===id){
      setSelected(current=>current ? {
        ...current,
        ...next,
        position:{...next.position},
        rotation:{...next.rotation},
        patch:{...next.patch}
      } : current);
    }
    if(currentFixture.kind!==next.kind)setSceneVersion(version=>version+1);

    const revision=sharedShowRevisionRef.current+1;
    sharedShowRevisionRef.current=revision;
    setSharedShowRevision(revision);
    directRef.current?.sendPatchUpdate({
      type:"shared-show.patch.update",revision,source:"lumaviz",showId:sharedShowName,
      fixture:{id:next.id,name:next.name,profileId:next.patch.profileId,modeId:next.patch.modeId??"",universe:next.patch.universe,address:next.patch.address,group:next.group,position:next.position,rotation:next.rotation}
    });
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
    setActiveCustomCameraId(null);
    setActiveView(view);
    sceneRef.current?.setView(view);
  }

  function saveCustomCamera() {
    const viz = sceneRef.current;
    if (!viz) return;
    const camera = viz.captureCamera("CAM " + (customCameras.length + 1));
    setCustomCameras((current) => [...current, camera]);
    setActiveCustomCameraId(camera.id);
    setActiveView("free");
  }

  function recallCustomCamera(camera: CustomCamera) {
    setActiveCustomCameraId(camera.id);
    setActiveView("free");
    sceneRef.current?.applyCustomCamera(camera);
  }

  function deleteCustomCamera(id: string) {
    setCustomCameras((current) => current.filter((camera) => camera.id !== id));
    if (activeCustomCameraId === id) setActiveCustomCameraId(null);
  }

  async function requestFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  }

  const linkDiagnostics = source === "artnet"
    ? "PACKETS " + packetCount + " · MATCHED " + matchedFixtureCount + (lastPacketSource ? " · " + lastPacketSource : "")
    : "";

  const sourceLabel = source === "lumarig"
    ? "LumaRig Direct"
    : source === "vizbridge"
      ? "VizBridge"
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
          {linkDiagnostics && <small>{linkDiagnostics}</small>}
        </div>
      </header>

      {page !== "monitor" && (
        <section className="command-bar">
          <div className="command-group">
            <button onClick={resetScene}><span>＋</span><small>NEW</small></button>
            <button onClick={openScene}><span>⌁</span><small>OPEN</small></button>
            <button onClick={saveScene}><span>▣</span><small>SAVE</small></button>
          </div>

          {page === "visualize" && (
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
            <PanelHeading title="STAGE / VENUE" />
            <div className="venue-sidebar"><label>VENUE</label><select value={activeLocationId} onChange={e=>loadLocation(e.target.value)}><option value="">Custom / Current Scene</option>{LOCATION_PRESETS.map(location=><option key={location.id} value={location.id}>{location.name}{location.estimated?" · estimated":""}</option>)}</select><small>{activeLocationId?"Shared venue preset loaded":"Custom venue state"}</small></div>
            <div className="fixture-commandbar"><button onClick={() => sceneRef.current?.selectAllFixtures()}>ALL</button><button onClick={duplicateSelected}>DUP</button><button onClick={() => arraySelected(4)}>ARRAY ×4</button><button className={snapEnabled ? "active" : ""} onClick={() => setSnapEnabled(v => !v)}>SNAP</button><input type="number" min="0.01" step="0.05" value={snapStep} onChange={e=>setSnapStep(Math.max(.01,Number(e.target.value)||.25))}/></div>
            <div className="tree">
              <TreeStatic icon="▱" label="Venue / Room" />
              <TreeStatic icon="▰" label="Stage" />
              <TreeStatic icon="▭" label="Projection Screen" />
              <TreeStatic icon="▥" label="Back Drape" />

              <div className="tree-section">
                <div className="tree-label"><span>⌄</span> OBJECTS <small>{objects.length}</small></div>
                {objects.map((object) => (
                  <button
                    key={object.id}
                    className={"tree-row fixture-row " + (selectedObjectId === object.id ? "selected" : "")}
                    onClick={() => { setSelectedObjectId(object.id); sceneRef.current?.selectSceneObject(object.id); }}
                  >
                    <span>{object.kind === "truss" ? "⌗" : object.kind === "platform" ? "▰" : "◫"}</span>
                    <span>{object.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <button className="add-object" onClick={addBuildObject}>＋ ADD OBJECT</button>
          </aside>

          <Viewport
            canvasRef={canvasRef}
            activeView={activeView}
            units={units}
          />

          <aside className="inspector-panel">
            <PanelHeading title={selectedObject ? "OBJECT" : "DIMENSIONS"} />

            {selectedObject ? (
              <>
                <section className="inspector-section">
                  <div className="eyebrow">SCENE OBJECT</div>
                  <input
                    value={selectedObject.name}
                    onChange={(event) => updateBuildObject(selectedObject.id, (object) => ({
                      ...object,
                      name: event.target.value
                    }))}
                  />
                </section>

                <section className="inspector-section">
                  <h3>TYPE</h3>
                  <select
                    value={selectedObject.kind}
                    onChange={(event) => updateBuildObject(selectedObject.id, (object) => ({
                      ...object,
                      kind: event.target.value as SceneObject["kind"]
                    }))}
                  >
                    <option value="truss">Truss</option>
                    <option value="platform">Platform / Riser</option>
                    <option value="box">Scenic Box / Object</option>
                    <option value="display">Display / Projection Surface</option>
                    <option value="speaker">Speaker</option>
                    <option value="pulpit">Pulpit / Lectern</option>
                    <option value="scenery">Scenery</option>
                  </select>
                </section>

                <ObjectVectorEditor
                  title="POSITION"
                  vector={selectedObject.position}
                  units={units}
                  dimensional
                  onChange={(axis, value) => updateBuildObject(selectedObject.id, (object) => ({
                    ...object,
                    position: { ...object.position, [axis]: value }
                  }))}
                />

                <ObjectVectorEditor
                  title="SIZE"
                  vector={selectedObject.size}
                  units={units}
                  dimensional
                  positive
                  onChange={(axis, value) => updateBuildObject(selectedObject.id, (object) => ({
                    ...object,
                    size: { ...object.size, [axis]: value }
                  }))}
                />

                <ObjectVectorEditor
                  title="ROTATION"
                  vector={selectedObject.rotation}
                  units={units}
                  onChange={(axis, value) => updateBuildObject(selectedObject.id, (object) => ({
                    ...object,
                    rotation: { ...object.rotation, [axis]: value }
                  }))}
                />

                <section className="inspector-section">
                  <button className="danger-button full-width" onClick={() => deleteBuildObject(selectedObject.id)}>
                    DELETE OBJECT
                  </button>
                </section>
              </>
            ) : (
              <>
                <section className="inspector-section">
                  <div className="eyebrow">REAL WORLD SCALE</div>
                  <h2>Venue + Stage</h2>
                  <p className="muted">Every object uses physical units. Select an object in the tree to edit its size and placement.</p>
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
              </>
            )}
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

          {(patchReport.conflicts.length>0 || patchReport.outOfRange.length>0) && <div className="patch-warning">
            <strong>PATCH NEEDS ATTENTION</strong>
            <span>{patchReport.conflicts.length ? `${patchReport.conflicts.length} overlap${patchReport.conflicts.length===1?"":"s"}` : ""}{patchReport.conflicts.length&&patchReport.outOfRange.length?" · ":""}{patchReport.outOfRange.length ? `${patchReport.outOfRange.length} fixture${patchReport.outOfRange.length===1?"":"s"} exceed channel 512` : ""}</span>
          </div>}

          <div className="patch-table">
            <div className="patch-row patch-head">
              <span>Fixture</span><span>Profile</span><span>Mode</span><span>Universe</span><span>Address</span><span>Footprint</span><span>Enabled</span><span />
            </div>
            {fixtures.map((fixture) => (
              <div className={"patch-row " + (patchReport.conflicts.some(conflict=>conflict.fixtures.some(item=>item.id===fixture.id)) || patchReport.outOfRange.some(span=>span.fixtureId===fixture.id) ? "patch-conflict" : "")} key={fixture.id}>
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
                      patch: { ...current.patch, profileId: event.target.value, modeId: profile?.modes[0]?.id }
                    }));
                  }}
                >
                  {FIXTURE_PROFILES.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                  ))}
                </select>
                <select
                  value={fixture.patch.modeId ?? FIXTURE_PROFILES.find(profile=>profile.id===fixture.patch.profileId)?.modes[0]?.id ?? ""}
                  onChange={(event)=>updateFixture(fixture.id,current=>({...current,patch:{...current.patch,modeId:event.target.value}}))}
                >
                  {FIXTURE_PROFILES.find(profile=>profile.id===fixture.patch.profileId)?.modes.map(mode=><option key={mode.id} value={mode.id}>{mode.name}</option>)}
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
                <span className="patch-footprint-readout">{(() => { const span=patchReport.spans.find(item=>item.fixtureId===fixture.id); return span ? `${span.start}–${span.end}` : "—"; })()}</span>
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
            <div className="operator-tabs browser-tabs">
              {(["fixtures","groups","scene","views"] as const).map((tab) => <button key={tab} className={browserTab === tab ? "active" : ""} onClick={() => setBrowserTab(tab)}>{tab.toUpperCase()}</button>)}
            </div>
            <div className="tree">
              {browserTab === "scene" && <><TreeStatic icon="▱" label="Room" /><TreeStatic icon="▰" label="Stage" />{objects.map((object) => <button key={object.id} className={"tree-row " + (selectedObjectId===object.id ? "selected" : "")} onClick={()=>{setSelectedObjectId(object.id);sceneRef.current?.selectSceneObject(object.id);}}><span>{object.kind==="display"?"▣":"⌗"}</span><span>{object.name}</span></button>)}</>}
              {browserTab === "views" && CAMERA_VIEWS.map((view) => <button key={view.id} className={"tree-row " + (activeView === view.id ? "selected" : "")} onClick={() => setView(view.id)}><span>◉</span><span>{view.label}</span></button>)}
              {browserTab === "groups" && [...new Set(fixtures.map((fixture) => fixture.group).filter(Boolean))].map((group) => <div key={group} className="tree-section"><div className="tree-label"><span>⌄</span>{group}</div>{fixtures.filter((fixture) => fixture.group === group).map((fixture) => <button key={fixture.id} className={"tree-row fixture-row " + (selected?.id === fixture.id ? "selected" : "")} onClick={() => selectFixture(fixture.id)}><span className={"fixture-icon " + fixture.kind}/><span>{fixture.name}</span></button>)}</div>)}
              {browserTab === "fixtures" && <div className="tree-section">
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
              </div>}
            </div>
          </aside>

          <div className="visualizer-center">
            <div className="viewport-modebar">
              <div className="mode-tabs">
                <button className={visualizerMode === "3d" ? "active" : ""} onClick={() => { setVisualizerMode("3d"); sceneRef.current?.setPlanView(false); }}>3D VIEW</button>
                <button className={visualizerMode === "2d" ? "active" : ""} onClick={() => { setVisualizerMode("2d"); sceneRef.current?.setPlanView(true); }}>2D PLAN</button>
                <button onClick={() => setPage("build")}>STAGE</button>
                <button onClick={() => setPage("build")}>MATERIALS</button>
                <button onClick={() => setPage("cameras")}>SNAPSHOTS</button>
              </div>
              <div className="camera-mini">CAMERA <strong>{activeView.toUpperCase().replace("-", " ")}</strong></div>
            </div>
            <Viewport canvasRef={canvasRef} activeView={activeView} units={units} />
            <div className="show-deck">
              <div className="deck-transport">
                <button className="transport-play" onClick={() => setPage("connect")}>▶</button>
                <button>■</button>
                <button>◀|</button>
              </div>
              <div className="deck-cue">
                <small>LIVE INPUT</small>
                <strong>{connectionState === "connected" ? "LumaRig / Art-Net" : "Waiting for source"}</strong>
              </div>
              <div className="deck-readout"><small>PACKETS</small><strong>{packetCount}</strong></div>
              <div className="deck-readout"><small>MATCHED</small><strong>{matchedFixtureCount}/{fixtures.length}</strong></div>
              <div className="deck-cues">
                {["PRE SHOW", "BUILD", "SONG 1", "CHORUS", "INTRO LOOK", "VERSE 1"].map((label, index) => (
                  <button key={label} className={index === 4 ? "active" : ""}><span>{index + 8}</span>{label}</button>
                ))}
              </div>
              <div className="deck-link">
                <span className={"status-dot " + connectionClass} />
                <div><small>DMX</small><strong>{connectionState === "connected" ? "Connected" : connectionState}</strong></div>
              </div>
            </div>
          </div>

          <aside className="inspector-panel">
            <div className="operator-tabs inspector-tabs">
              {(["properties","dmx","live"] as const).map((tab) => <button key={tab} className={inspectorTab === tab ? "active" : ""} onClick={() => setInspectorTab(tab)}>{tab.toUpperCase()}</button>)}
            </div>
            {selected ? (
              <>
                <section className="inspector-section selected-card">
                  <div className="selection-accent" />
                  <div className="eyebrow">FIXTURE</div>
                  <h2>{selected.name}</h2>
                  <div className="fixture-meta">
                    <span>{selected.kind.replace("-", " ")}</span>
                    <span>U{selected.patch.universe} / {selected.patch.address}</span>
                    <span>{Math.round(selected.intensity * 100)}%</span>
                    <span className="color-chip" style={{ background: selected.color }} />
                  </div>
                </section>
                {inspectorTab === "properties" && <section className="inspector-section">
                  <h3>FIXTURE PROFILE</h3>
                  <input className="fixture-search" placeholder="Search manufacturer or model…" value={fixtureSearch} onChange={e=>setFixtureSearch(e.target.value)} />
                  <label className="gdtf-import">IMPORT GDTF / XML<input type="file" accept=".gdtf,.xml" onChange={e=>e.target.files?.[0] && void importFixtureFile(e.target.files[0])}/></label>
                  <select value={selected.patch.profileId} onChange={(event) => {
                    const profile = FIXTURE_PROFILES.find((item) => item.id === event.target.value);
                    updateFixture(selected.id, (current) => ({ ...current, kind: profile?.kind ?? current.kind, patch: { ...current.patch, profileId: event.target.value, modeId: profile?.modes[0]?.id } }));
                  }}>
                    {FIXTURE_PROFILES.filter(profile => !fixtureSearch || (profile.manufacturer+" "+profile.model).toLowerCase().includes(fixtureSearch.toLowerCase())).map((profile) => <option key={profile.id} value={profile.id}>{profile.manufacturer} · {profile.model}</option>)}
                  </select>
                  <h3>DMX MODE</h3>
                  <select value={selected.patch.modeId ?? selectedProfile?.modes[0]?.id ?? ""} onChange={(event) => updateFixture(selected.id, (current) => ({ ...current, patch: { ...current.patch, modeId: event.target.value } }))}>
                    {selectedProfile?.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.name} · {mode.channelCount}ch</option>)}
                  </select>
                  {selectedProfile && <div className="fixture-profile-summary">
                    <div className="profile-summary-head"><span className={selectedProfile.verified?"verified":"unverified"}>{selectedProfile.verified?"VERIFIED / IMPORTED":"VERIFY MANUAL"}</span><strong>{selectedProfile.manufacturer} · {selectedProfile.model}</strong></div>
                    <small>{selectedProfile.note}</small>
                    <dl>
                      <div><dt>Footprint</dt><dd>{selectedMode?.channelCount ?? 0} ch{selectedPatchSpan ? ` · ${selectedPatchSpan.start}–${selectedPatchSpan.end}` : ""}</dd></div>
                      {selectedProfile.movement&&<div><dt>Movement</dt><dd>{selectedProfile.movement.panRangeDegrees}° pan · {selectedProfile.movement.tiltRangeDegrees}° tilt</dd></div>}
                      {selectedProfile.optics&&<div><dt>Beam</dt><dd>{selectedProfile.optics.beamAngleMinDegrees}–{selectedProfile.optics.beamAngleMaxDegrees}°</dd></div>}
                    </dl>
                    <div className="capability-chips">{[...new Set(selectedMode?.channels.flatMap(channel=>channel.parameter?[channel.parameter]:[]) ?? [])].map(capability=><span key={capability}>{capability}</span>)}</div>
                    {selectedPatchConflict&&<div className="selected-patch-warning">PATCH CONFLICT / OUT OF RANGE</div>}
                  </div>}
                </section>}
                {inspectorTab === "properties" && <section className="inspector-section">
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
                </section>}
                {inspectorTab === "properties" && <section className="inspector-section">
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
                </section>}
                {inspectorTab === "dmx" && <section className="inspector-section data-block">
                  <h3>DMX PATCH</h3>
                  <dl><div><dt>Profile</dt><dd>{FIXTURE_PROFILES.find((profile) => profile.id === selected.patch.profileId)?.name ?? selected.patch.profileId}</dd></div><div><dt>Universe</dt><dd>{selected.patch.universe}</dd></div><div><dt>Mode</dt><dd>{FIXTURE_PROFILES.find((profile) => profile.id === selected.patch.profileId)?.modes.find((mode) => mode.id === selected.patch.modeId)?.name ?? selected.patch.modeId ?? "Default"}</dd></div><div><dt>Address</dt><dd>{selected.patch.address}</dd></div><div><dt>Enabled</dt><dd>{selected.patch.enabled ? "YES" : "NO"}</dd></div></dl>
                </section>}
                {inspectorTab === "live" && <section className="inspector-section data-block">
                  <h3>LIVE INPUT</h3>
                  <dl>
                    <div><dt>Pan</dt><dd>{selected.pan.toFixed(1)}°</dd></div>
                    <div><dt>Tilt</dt><dd>{selected.tilt.toFixed(1)}°</dd></div>
                    <div><dt>Beam</dt><dd>{selected.beamAngle.toFixed(1)}°</dd></div>
                    <div><dt>Source</dt><dd>{sourceLabel}</dd></div>
                    <div><dt>Intensity</dt><dd>{Math.round(selected.intensity * 100)}%</dd></div>
                  </dl>
                </section>}
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

              {customCameras.length > 0 && (
                <div className="tree-label camera-custom-label">CUSTOM</div>
              )}

              {customCameras.map((camera) => (
                <div className="custom-camera-row" key={camera.id}>
                  <button className="camera-card" onClick={() => recallCustomCamera(camera)}>
                    <strong>{camera.name}</strong>
                    <span>Saved production position</span>
                  </button>
                  <button
                    className="camera-delete"
                    onClick={() => deleteCustomCamera(camera.id)}
                    title={"Delete " + camera.name}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button className="add-object" onClick={saveCustomCamera}>＋ SAVE CUSTOM CAMERA</button>
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
              <div className="connection-metrics">
                <span><b>{packetCount}</b> packets</span>
                <span><b>{matchedFixtureCount}</b> matched fixtures</span>
                <span><b>{patchedUniverses.length}</b> patched universe{patchedUniverses.length === 1 ? "" : "s"}</span>
                <span><b>6454</b> UDP port</span>
              </div>
            </div>
          </div>

          <section className="stage-sync-card">
            <div className="stage-sync-head">
              <div><span>STAGE SYNC</span><strong>{stageSyncMode.toUpperCase()}</strong><small>Revision {stageRevision} · {pendingStageChanges.length} pending</small></div>
              <div className="stage-sync-modes">
                {(["locked","review","live"] as StageSyncMode[]).map(mode=><button key={mode} className={stageSyncMode===mode?"active":""} onClick={()=>setStageSyncMode(mode)}>{mode.toUpperCase()}</button>)}
              </div>
            </div>
            <p>{stageSyncMode==="locked"?"Incoming stage edits are held for review and never auto-apply.":stageSyncMode==="review"?"Incoming changes are queued so the operator approves them before the world changes.":"Safe fixture/scenery transforms auto-apply. Patch, profile and calibration changes still require review."}</p>
            <div className="stage-sync-list">
              {pendingStageChanges.slice(0,6).map(change=><article key={change.id} className={change.status==="conflict"?"conflict":""}>
                <div><span>{change.category.toUpperCase()}</span><strong>{change.summary}</strong><small>{change.source.toUpperCase()} · base R{change.baseRevision}{change.status==="conflict"?" · REVISION CONFLICT":""}</small></div>
                <div className="stage-sync-actions">
                  <button disabled={change.status==="conflict"||!stageChangeSupported(change)} onClick={()=>applyIncomingStageChange(change,true)}>APPROVE</button>
                  <button onClick={()=>rejectStageChange(change.id)}>REJECT</button>
                </div>
              </article>)}
              {!pendingStageChanges.length&&<div className="stage-sync-empty">No incoming stage changes are waiting.</div>}
            </div>
          </section>

          <div className="connection-grid">
            <ConnectionCard
              title="VizBridge"
              badge="ART-NET BRIDGE"
              text="Use VizBridge when it owns UDP 6454. LumaViz receives normalized DMX over a local WebSocket so the apps never compete for the Art-Net socket."
              active={source === "vizbridge"}
            >
              <input value="ws://127.0.0.1:9461/dmx" disabled />
              <button className="primary-button" onClick={connectBridge}>CONNECT VIZBRIDGE</button>
            </ConnectionCard>
            <ConnectionCard
              title="LumaRig Direct"
              badge="PREFERRED"
              text="Native semantic fixture transport from LumaRig. No DMX decoding is required and Art-Net remains available as a fallback."
              active={source === "lumarig"}
            >
              <input value={lumaRigUrl} onChange={(event) => setLumaRigUrl(event.target.value)} />
              <button className="primary-button" onClick={connectDirect}>CONNECT LUMARIG DIRECT</button>
            </ConnectionCard>

            <ConnectionCard
              title="Art-Net"
              badge="DMX FALLBACK"
              text="Standard DMX-over-network fallback. Listen on UDP 6454 and PATCH converts channels into fixture behavior."
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

      {page === "screens" && <section className="library-page">
        <header className="section-heading">
          <div><span>DISPLAY SURFACES</span><h2>SCREEN ROUTING</h2><small>LumaStudio {studioMediaState} · {studioFrame ? `Output ${studioFrame.outputId} · ${studioFrame.positionSeconds.toFixed(1)}s` : "waiting for media"}</small></div>
          <button onClick={()=>setDisplaySurfaces(current=>[...current,{id:crypto.randomUUID(),name:`Display ${current.length+1}`,sceneObjectId:objects.find(o=>o.kind==="display")?.id,sourceOutputId:"program-1",fit:"fit",brightness:1,flipX:false,flipY:false,rotation:0,latencyMs:0}])}>+ DISPLAY</button>
        </header>
        <div className="shared-library-grid screen-routing-grid">
          {displaySurfaces.map(surface=>{
            const media=displayMedia.get(surface.id);
            return <article key={surface.id} className="screen-route-card">
              <div className="screen-route-head"><div><span>{media?.url?"LIVE MEDIA":media?.supported===false?"SOURCE LIMITED":"READY"}</span><strong>{surface.name}</strong><small>{media?.label ?? "Waiting for Studio"}</small></div><button className="danger-button" onClick={()=>setDisplaySurfaces(all=>all.filter(item=>item.id!==surface.id))}>REMOVE</button></div>
              <label>SCREEN OBJECT<select value={surface.sceneObjectId??""} onChange={e=>setDisplaySurfaces(all=>all.map(x=>x.id===surface.id?{...x,sceneObjectId:e.target.value||undefined}:x))}><option value="">Choose screen</option>{objects.filter(o=>o.kind==="display").map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
              <label>SOURCE<select value={surface.sourceOutputId} onChange={e=>setDisplaySurfaces(all=>all.map(x=>x.id===surface.id?{...x,sourceOutputId:e.target.value}:x))}><option value="program-1">LumaStudio · Program 1</option></select></label>
              <label>FIT<select value={surface.fit} onChange={e=>setDisplaySurfaces(all=>all.map(x=>x.id===surface.id?{...x,fit:e.target.value as DisplaySurface["fit"]}:x))}><option value="fit">Fit</option><option value="fill">Fill</option><option value="stretch">Stretch</option></select></label>
              <label>BRIGHTNESS<input type="range" min="0" max="2" step=".05" value={surface.brightness} onChange={e=>setDisplaySurfaces(all=>all.map(x=>x.id===surface.id?{...x,brightness:Number(e.target.value)}:x))}/></label>
              <div className="screen-route-options">
                <label><input type="checkbox" checked={surface.flipX} onChange={e=>setDisplaySurfaces(all=>all.map(x=>x.id===surface.id?{...x,flipX:e.target.checked}:x))}/> FLIP X</label>
                <label><input type="checkbox" checked={surface.flipY} onChange={e=>setDisplaySurfaces(all=>all.map(x=>x.id===surface.id?{...x,flipY:e.target.checked}:x))}/> FLIP Y</label>
              </div>
              <label>ROTATION<input type="number" step="90" value={surface.rotation} onChange={e=>setDisplaySurfaces(all=>all.map(x=>x.id===surface.id?{...x,rotation:Number(e.target.value)}:x))}/></label>
              <label>LATENCY <input type="number" min="0" value={surface.latencyMs} onChange={e=>setDisplaySurfaces(all=>all.map(x=>x.id===surface.id?{...x,latencyMs:Math.max(0,Number(e.target.value)||0)}:x))}/> ms</label>
            </article>;
          })}
          {!displaySurfaces.length && <div className="empty-state"><strong>No display routes yet</strong><span>Load a venue with semantic display objects, then add a route from LumaStudio Program 1.</span></div>}
        </div>
      </section>}

      {page === "library" && <section className="library-page"><header className="section-heading"><div><span>SHARED SHOW LIBRARY</span><h2>{sharedShowName}</h2><small>Revision {sharedShowRevision} · synchronized with LumaRig Direct</small></div></header><div className="library-location-summary"><span>VENUE</span><strong>{LOCATION_PRESETS.find(location=>location.id===activeLocationId)?.name??"Custom / Current Scene"}</strong><small>Change venue from STAGE / VENUE so the room remains part of the scene workflow.</small><button onClick={()=>setPage("build")}>OPEN STAGE / VENUE</button></div><div className="shared-library-grid">{sharedShowLibrary.length ? sharedShowLibrary.map((item) => <article key={item.id}><span>{item.status === "template" ? "TEMPLATE" : item.status === "show" ? "SERVICE SHOW" : "DRAFT"}</span><strong>{item.name}</strong><small>{new Date(item.savedAt).toLocaleString()}</small><button onClick={() => { setSharedShowName(item.name); setConnectionMessage(item.name+" selected from Shared Show Library"); }}>LOAD SHOW</button></article>) : <div className="empty-state"><strong>No shared projects received yet</strong><span>Connect LumaRig Direct to receive templates and service shows.</span></div>}</div></section>}

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
          <div>{sharedShowName} · R{sharedShowRevision}{sharedShowLibrary.length ? ` · ${sharedShowLibrary.length} shared shows` : ""}</div>
          <div>{patchedUniverses.length} universe{patchedUniverses.length === 1 ? "" : "s"}</div>
          <div>SYNC {stageSyncMode.toUpperCase()} · R{stageRevision}{pendingStageChanges.length ? ` · ${pendingStageChanges.length} pending` : ""}</div>
          <div className="status-spacer" />
          <div>v0.4.0</div>
        </footer>
      )}
    </main>
  );
}


function ObjectVectorEditor({
  title,
  vector,
  units,
  dimensional = false,
  positive = false,
  onChange
}: {
  title: string;
  vector: { x: number; y: number; z: number };
  units: UnitSystem;
  dimensional?: boolean;
  positive?: boolean;
  onChange: (axis: "x" | "y" | "z", value: number) => void;
}) {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      <div className="three-inputs">
        {(["x", "y", "z"] as const).map((axis) => (
          <label key={axis}>
            <span>{axis.toUpperCase()}</span>
            <input
              value={dimensional ? displayDistance(vector[axis], units) : Number(vector[axis].toFixed(1))}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) return;
                const value = dimensional ? inputDistance(parsed, units) : parsed;
                if (positive && value <= 0) return;
                onChange(axis, value);
              }}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function PanelHeading({ title }: { title: string }) {
  return <div className="panel-heading"><span>{title}</span></div>;
}

function TreeStatic({ icon, label }: { icon: string; label: string }) {
  return <div className="tree-row static-row"><span>{icon}</span>{label}</div>;
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
