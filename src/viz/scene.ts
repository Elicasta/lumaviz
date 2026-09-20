import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  GizmoManager,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SpotLight,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import "@babylonjs/loaders";
import { getCameraPose } from "./cameraPresets";
import { createSceneMaterials } from "./materials";
import type {
  CustomCamera,
  FixtureDefinition,
  FixtureFrame,
  MaterialPreset,
  SceneDimensions,
  SceneObject,
  SelectionSnapshot,
  TransformTool,
  ViewPreset
} from "./types";
import { clamp01 } from "./units";

interface FixtureRuntime {
  definition: FixtureDefinition;
  root: TransformNode;
  panNode: TransformNode;
  aimNode: TransformNode;
  beam: Mesh;
  beamMaterial: PBRMaterial;
  light: SpotLight;
  intensity: number;
  color: string;
  pan: number;
  tilt: number;
  beamAngle: number;
}

export class LumaVizScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;

  private dimensions: SceneDimensions;
  private fixtures = new Map<string, FixtureRuntime>();
  private gizmos: GizmoManager;
  private selectedId: string | null = null;
  private onSelection?: (value: SelectionSnapshot | null) => void;
  private resizeObserver: ResizeObserver;

  constructor(
    canvas: HTMLCanvasElement,
    dimensions: SceneDimensions,
    fixtures: FixtureDefinition[],
    objects: SceneObject[],
    materialPreset: MaterialPreset,
    onSelection?: (value: SelectionSnapshot | null) => void
  ) {
    this.dimensions = dimensions;
    this.onSelection = onSelection;

    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.025, 0.028, 0.032, 1);
    this.scene.ambientColor = new Color3(0.13, 0.14, 0.16);

    this.camera = new ArcRotateCamera(
      "production-camera",
      Math.PI / 2,
      1.12,
      Math.max(dimensions.roomWidth, dimensions.roomDepth) * 0.78,
      new Vector3(0, dimensions.stageHeight + 1.5, dimensions.stageDepth * 0.3),
      this.scene
    );
    this.camera.minZ = 0.05;
    this.camera.wheelPrecision = 28;
    this.camera.pinchPrecision = 70;
    this.camera.lowerRadiusLimit = 1.2;
    this.camera.upperRadiusLimit = Math.max(dimensions.roomWidth, dimensions.roomDepth) * 2.2;
    this.camera.attachControl(canvas, true);

    const ambient = new HemisphericLight(
      "house-worklight",
      new Vector3(0, 1, 0),
      this.scene
    );
    ambient.intensity = 0.34;
    ambient.diffuse = new Color3(0.9, 0.92, 1);

    this.gizmos = new GizmoManager(this.scene);
    this.gizmos.usePointerToAttachGizmos = false;
    this.gizmos.positionGizmoEnabled = false;
    this.gizmos.rotationGizmoEnabled = false;

    this.buildScene(fixtures, objects, materialPreset);
    this.setView("foh");

    this.scene.onPointerDown = (_, pick) => {
      const id = pick?.pickedMesh?.metadata?.fixtureId as string | undefined;
      if (id) this.selectFixture(id);
    };

    this.engine.runRenderLoop(() => this.scene.render());
    this.resizeObserver = new ResizeObserver(() => this.engine.resize());
    this.resizeObserver.observe(canvas);
  }

  private buildScene(
    fixtures: FixtureDefinition[],
    objects: SceneObject[],
    materialPreset: MaterialPreset
  ): void {
    const m = createSceneMaterials(this.scene, materialPreset);
    const d = this.dimensions;

    const floor = MeshBuilder.CreateGround("room-floor", {
      width: d.roomWidth,
      height: d.roomDepth
    }, this.scene);
    floor.position.z = d.stageDepth - d.roomDepth / 2;
    floor.material = m.floor;
    floor.receiveShadows = true;

    const backWall = MeshBuilder.CreateBox("back-wall", {
      width: d.roomWidth,
      height: d.ceilingHeight,
      depth: 0.08
    }, this.scene);
    backWall.position.set(0, d.ceilingHeight / 2, d.stageDepth + 0.04);
    backWall.material = m.wall;

    const leftWall = MeshBuilder.CreateBox("left-wall", {
      width: 0.08,
      height: d.ceilingHeight,
      depth: d.roomDepth
    }, this.scene);
    leftWall.position.set(
      -d.roomWidth / 2,
      d.ceilingHeight / 2,
      d.stageDepth - d.roomDepth / 2
    );
    leftWall.material = m.wall;

    const rightWall = leftWall.clone("right-wall");
    if (rightWall) rightWall.position.x = d.roomWidth / 2;

    const stage = MeshBuilder.CreateBox("stage", {
      width: d.stageWidth,
      height: d.stageHeight,
      depth: d.stageDepth
    }, this.scene);
    stage.position.set(0, d.stageHeight / 2, d.stageDepth / 2);
    stage.material = m.stage;

    const drape = MeshBuilder.CreateBox("drape", {
      width: d.drapeWidth,
      height: d.drapeHeight,
      depth: 0.14
    }, this.scene);
    drape.position.set(
      0,
      d.stageHeight + d.drapeHeight / 2,
      d.stageDepth - 0.22
    );
    drape.material = m.drape;

    const screen = MeshBuilder.CreatePlane("screen", {
      width: d.screenWidth,
      height: d.screenHeight,
      sideOrientation: Mesh.DOUBLESIDE
    }, this.scene);
    screen.position.set(
      0,
      d.stageHeight + d.screenBottom + d.screenHeight / 2,
      d.stageDepth - 0.31
    );
    screen.rotation.y = Math.PI;
    screen.material = m.screen;

    for (const object of objects) {
      const mesh = MeshBuilder.CreateBox(object.id, {
        width: object.size.x,
        height: object.size.y,
        depth: object.size.z
      }, this.scene);
      mesh.position.set(object.position.x, object.position.y, object.position.z);
      mesh.rotation.set(
        object.rotation.x * Math.PI / 180,
        object.rotation.y * Math.PI / 180,
        object.rotation.z * Math.PI / 180
      );
      mesh.material = object.kind === "truss"
        ? m.fixture
        : object.kind === "platform"
          ? m.stage
          : m.wall;
      mesh.metadata = { sceneObjectId: object.id, sceneObjectKind: object.kind };
    }

    fixtures.forEach((fixture) => this.createFixture(fixture, m.fixture));
  }

  private createFixture(definition: FixtureDefinition, material: PBRMaterial): void {
    const root = new TransformNode(definition.id, this.scene);
    root.position.set(definition.position.x, definition.position.y, definition.position.z);
    root.rotation.set(
      definition.rotation.x * Math.PI / 180,
      definition.rotation.y * Math.PI / 180,
      definition.rotation.z * Math.PI / 180
    );
    root.metadata = { fixtureId: definition.id };

    const panNode = new TransformNode(`${definition.id}-pan`, this.scene);
    panNode.parent = root;
    let aimNode = panNode;

    if (definition.kind === "moving-head") {
      const base = MeshBuilder.CreateCylinder(`${definition.id}-base`, {
        height: 0.2,
        diameter: 0.5,
        tessellation: 32
      }, this.scene);
      base.parent = root;
      base.material = material;
      base.metadata = { fixtureId: definition.id };

      const yokeLeft = MeshBuilder.CreateBox(`${definition.id}-yoke-l`, {
        width: 0.1,
        height: 0.56,
        depth: 0.15
      }, this.scene);
      yokeLeft.position.set(-0.2, 0.34, 0);
      yokeLeft.parent = panNode;
      yokeLeft.material = material;
      yokeLeft.metadata = { fixtureId: definition.id };

      const yokeRight = yokeLeft.clone(`${definition.id}-yoke-r`);
      if (yokeRight) yokeRight.position.x = 0.2;

      aimNode = new TransformNode(`${definition.id}-tilt`, this.scene);
      aimNode.position.y = 0.48;
      aimNode.parent = panNode;

      const head = MeshBuilder.CreateBox(`${definition.id}-head`, {
        width: 0.46,
        height: 0.34,
        depth: 0.54
      }, this.scene);
      head.parent = aimNode;
      head.material = material;
      head.metadata = { fixtureId: definition.id };
    } else {
      const can = MeshBuilder.CreateCylinder(`${definition.id}-can`, {
        height: 0.42,
        diameter: 0.34,
        tessellation: 28
      }, this.scene);
      can.rotation.x = Math.PI / 2;
      can.parent = aimNode;
      can.material = material;
      can.metadata = { fixtureId: definition.id };
    }

    const beamMaterial = new PBRMaterial(`${definition.id}-beam-material`, this.scene);
    beamMaterial.albedoColor = new Color3(1, 1, 1);
    beamMaterial.emissiveColor = new Color3(0.8, 0.8, 0.8);
    beamMaterial.alpha = 0.12;
    beamMaterial.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    beamMaterial.disableLighting = true;

    const beamLength = 7;
    const beamAngle = 18;
    const radius = Math.tan((beamAngle * Math.PI / 180) / 2) * beamLength;
    const beam = MeshBuilder.CreateCylinder(`${definition.id}-beam`, {
      height: beamLength,
      diameterTop: 0.06,
      diameterBottom: radius * 2,
      tessellation: 32
    }, this.scene);
    beam.rotation.x = Math.PI / 2;
    beam.position.z = -beamLength / 2 - 0.25;
    beam.parent = aimNode;
    beam.material = beamMaterial;
    beam.metadata = { fixtureId: definition.id };
    beam.isPickable = false;

    const light = new SpotLight(
      `${definition.id}-light`,
      new Vector3(0, 0, -0.25),
      new Vector3(0, 0, -1),
      beamAngle * Math.PI / 180,
      18,
      this.scene
    );
    light.parent = aimNode;
    light.intensity = 7;
    light.diffuse = new Color3(1, 1, 1);

    const runtime: FixtureRuntime = {
      definition: {
        ...definition,
        position: { ...definition.position },
        rotation: { ...definition.rotation }
      },
      root,
      panNode,
      aimNode,
      beam,
      beamMaterial,
      light,
      intensity: 0.72,
      color: "#ffffff",
      pan: 0,
      tilt: definition.kind === "moving-head" ? 25 : 0,
      beamAngle
    };

    this.fixtures.set(definition.id, runtime);
  }

  captureCamera(name: string): CustomCamera {
    const target = this.camera.target;
    return {
      id: "camera-" + Date.now(),
      name,
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      },
      target: {
        x: target.x,
        y: target.y,
        z: target.z
      }
    };
  }

  applyCustomCamera(camera: CustomCamera): void {
    this.camera.setPosition(new Vector3(
      camera.position.x,
      camera.position.y,
      camera.position.z
    ));
    this.camera.setTarget(new Vector3(
      camera.target.x,
      camera.target.y,
      camera.target.z
    ));
  }

  setView(preset: ViewPreset): void {
    if (preset === "free") return;
    const pose = getCameraPose(preset, this.dimensions);
    this.camera.setPosition(new Vector3(pose.position.x, pose.position.y, pose.position.z));
    this.camera.setTarget(new Vector3(pose.target.x, pose.target.y, pose.target.z));
  }

  setTool(tool: TransformTool): void {
    this.gizmos.positionGizmoEnabled = tool === "move";
    this.gizmos.rotationGizmoEnabled = tool === "rotate";
    if (tool === "select") {
      this.gizmos.attachToNode(null);
    } else if (this.selectedId) {
      this.gizmos.attachToNode(this.fixtures.get(this.selectedId)?.root ?? null);
    }
  }

  selectFixture(id: string): void {
    const runtime = this.fixtures.get(id);
    if (!runtime) return;
    this.selectedId = id;
    this.emitSelection(runtime);
  }

  updateSelectedPosition(axis: "x" | "y" | "z", value: number): void {
    if (!this.selectedId) return;
    const runtime = this.fixtures.get(this.selectedId);
    if (!runtime) return;
    runtime.root.position[axis] = value;
    runtime.definition.position[axis] = value;
    this.emitSelection(runtime);
  }

  updateSelectedRotation(axis: "x" | "y" | "z", degrees: number): void {
    if (!this.selectedId) return;
    const runtime = this.fixtures.get(this.selectedId);
    if (!runtime) return;
    runtime.root.rotation[axis] = degrees * Math.PI / 180;
    runtime.definition.rotation[axis] = degrees;
    this.emitSelection(runtime);
  }

  applyFrame(frame: FixtureFrame): void {
    // WebSocket is ordered and native UDP adapters normalize delivery before this point.
    // Do not compare sequence numbers across different sources because Art-Net/sACN wrap.
    for (const state of frame.fixtures) {
      const runtime = this.fixtures.get(state.id);
      if (!runtime) continue;

      if (state.intensity !== undefined) runtime.intensity = clamp01(state.intensity);
      if (state.color !== undefined) runtime.color = state.color;
      if (state.pan !== undefined) runtime.pan = state.pan;
      if (state.tilt !== undefined) runtime.tilt = state.tilt;
      if (state.beamAngle !== undefined) runtime.beamAngle = state.beamAngle;

      const color = Color3.FromHexString(runtime.color);
      runtime.light.diffuse = color;
      runtime.light.intensity = runtime.intensity * 14;
      runtime.light.angle = runtime.beamAngle * Math.PI / 180;
      const beamScale = Math.tan((runtime.beamAngle * Math.PI / 180) / 2)
        / Math.tan((18 * Math.PI / 180) / 2);
      runtime.beam.scaling.x = beamScale;
      runtime.beam.scaling.z = beamScale;
      runtime.beamMaterial.albedoColor = color;
      runtime.beamMaterial.emissiveColor = color.scale(0.85);
      runtime.beamMaterial.alpha = runtime.intensity * 0.16;
      runtime.beam.setEnabled(runtime.intensity > 0.01);

      if (runtime.definition.kind === "moving-head") {
        runtime.panNode.rotation.y = runtime.pan * Math.PI / 180;
        runtime.aimNode.rotation.x = runtime.tilt * Math.PI / 180;
      }

      if (this.selectedId === state.id) this.emitSelection(runtime);
    }
  }

  demoFrame(timeSeconds: number): FixtureFrame {
    const colors = ["#ff2f52", "#7b61ff", "#28d7ff", "#ffb13b"];
    return {
      version: 1,
      showId: "lumaviz-demo",
      sequence: Math.floor(timeSeconds * 30),
      timestamp: Date.now(),
      fixtures: [...this.fixtures.values()].map((runtime, index) => ({
        id: runtime.definition.id,
        intensity: 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(timeSeconds * 1.1 + index)),
        color: colors[index % colors.length],
        pan: runtime.definition.kind === "moving-head"
          ? Math.sin(timeSeconds * 0.55 + index) * 58
          : undefined,
        tilt: runtime.definition.kind === "moving-head"
          ? 28 + Math.sin(timeSeconds * 0.73 + index * 0.4) * 20
          : undefined
      }))
    };
  }

  private emitSelection(runtime: FixtureRuntime): void {
    this.onSelection?.({
      ...runtime.definition,
      position: {
        x: runtime.root.position.x,
        y: runtime.root.position.y,
        z: runtime.root.position.z
      },
      rotation: {
        x: runtime.root.rotation.x * 180 / Math.PI,
        y: runtime.root.rotation.y * 180 / Math.PI,
        z: runtime.root.rotation.z * 180 / Math.PI
      },
      intensity: runtime.intensity,
      color: runtime.color,
      pan: runtime.pan,
      tilt: runtime.tilt,
      beamAngle: runtime.beamAngle
    });
  }

  dispose(): void {
    this.resizeObserver.disconnect();
    this.scene.dispose();
    this.engine.dispose();
  }
}
