import {
  ArcRotateCamera,
  Camera,
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
  Vector3,
  VideoTexture,
  Texture
} from "@babylonjs/core";
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

interface SceneObjectRuntime {
  definition: SceneObject;
  mesh: Mesh;
  baseMaterial: PBRMaterial;
  displayMaterial?: PBRMaterial;
  videoTexture?: VideoTexture;
  displaySource?: string;
}

export class LumaVizScene {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;

  private dimensions: SceneDimensions;
  private fixtures = new Map<string, FixtureRuntime>();
  private sceneObjects = new Map<string, SceneObjectRuntime>();
  private selectedObjectId: string | null = null;
  private gizmos: GizmoManager;
  private selectedId: string | null = null;
  private selectedIds = new Set<string>();
  private snapEnabled = true;
  private snapStep = 0.25;
  private activeTool: TransformTool = "select";
  private onSelection?: (value: SelectionSnapshot | null) => void;
  private onFixtureTransform?: (value: FixtureDefinition) => void;
  private onSceneObjectTransform?: (value: SceneObject) => void;
  private onSceneObjectSelect?: (id: string | null) => void;
  private planRestoreCamera: CustomCamera | null = null;
  private resizeObserver: ResizeObserver;

  constructor(
    canvas: HTMLCanvasElement,
    dimensions: SceneDimensions,
    fixtures: FixtureDefinition[],
    objects: SceneObject[],
    materialPreset: MaterialPreset,
    onSelection?: (value: SelectionSnapshot | null) => void,
    onFixtureTransform?: (value: FixtureDefinition) => void,
    onSceneObjectTransform?: (value: SceneObject) => void,
    onSceneObjectSelect?: (id: string | null) => void
  ) {
    this.dimensions = dimensions;
    this.onSelection = onSelection;
    this.onFixtureTransform = onFixtureTransform;
    this.onSceneObjectTransform = onSceneObjectTransform;
    this.onSceneObjectSelect = onSceneObjectSelect;

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

    this.scene.onPointerDown = (event, pick) => {
      const id = pick?.pickedMesh?.metadata?.fixtureId as string | undefined;
      if (id) this.selectFixture(id, Boolean((event as PointerEvent)?.shiftKey));
      const objectId = pick?.pickedMesh?.metadata?.sceneObjectId as string | undefined;
      if (objectId) this.selectSceneObject(objectId);
    };

    this.scene.onPointerUp = () => {
      this.syncSelectedTransform();
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

    if (!objects.some((object) => object.kind === "display")) {
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
    }

    for (const object of objects) {
      const mesh = object.kind === "display"
        ? MeshBuilder.CreatePlane(object.id, {
            width: object.size.x,
            height: object.size.y,
            sideOrientation: Mesh.DOUBLESIDE
          }, this.scene)
        : MeshBuilder.CreateBox(object.id, {
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
      const baseMaterial = object.kind === "truss" || object.kind === "speaker"
        ? m.fixture
        : object.kind === "platform"
          ? m.stage
          : object.kind === "display"
            ? m.screen
            : m.wall;
      mesh.material = baseMaterial;
      mesh.metadata = { sceneObjectId: object.id, sceneObjectKind: object.kind };
      this.sceneObjects.set(object.id, {
        definition: { ...object, position: { ...object.position }, rotation: { ...object.rotation }, size: { ...object.size } },
        mesh,
        baseMaterial
      });
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
    } else if (definition.kind === "bar") {
      const body = MeshBuilder.CreateBox(`${definition.id}-bar`, {
        width: 1.05,
        height: 0.14,
        depth: 0.18
      }, this.scene);
      body.parent = aimNode;
      body.material = material;
      body.metadata = { fixtureId: definition.id };
      for (let index = 0; index < 8; index += 1) {
        const lens = MeshBuilder.CreateCylinder(`${definition.id}-lens-${index}`, {
          height: 0.02,
          diameter: 0.08,
          tessellation: 20
        }, this.scene);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(-0.43 + index * 0.123, 0, -0.1);
        lens.parent = aimNode;
        lens.material = material;
        lens.metadata = { fixtureId: definition.id };
      }
    } else if (definition.kind === "blinder") {
      const body = MeshBuilder.CreateBox(`${definition.id}-blinder`, {
        width: 0.7,
        height: 0.28,
        depth: 0.18
      }, this.scene);
      body.parent = aimNode;
      body.material = material;
      body.metadata = { fixtureId: definition.id };
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

  selectSceneObject(id: string): void {
    const runtime = this.sceneObjects.get(id);
    if (!runtime) return;
    this.selectedObjectId = id;
    this.onSceneObjectSelect?.(id);
    this.selectedIds.clear();
    this.selectedId = null;
    this.onSelection?.(null);
    if (this.activeTool === "select") this.gizmos.attachToNode(null);
    else this.gizmos.attachToMesh(runtime.mesh);
  }

  updateSceneObject(definition: SceneObject): void {
    const runtime = this.sceneObjects.get(definition.id);
    if (!runtime) return;
    const previous = runtime.definition;
    runtime.mesh.position.set(definition.position.x, definition.position.y, definition.position.z);
    runtime.mesh.rotation.set(definition.rotation.x * Math.PI / 180, definition.rotation.y * Math.PI / 180, definition.rotation.z * Math.PI / 180);
    runtime.mesh.scaling.x *= definition.size.x / Math.max(previous.size.x, 0.001);
    runtime.mesh.scaling.y *= definition.size.y / Math.max(previous.size.y, 0.001);
    if (definition.kind !== "display") runtime.mesh.scaling.z *= definition.size.z / Math.max(previous.size.z, 0.001);
    runtime.definition = { ...definition, position: { ...definition.position }, rotation: { ...definition.rotation }, size: { ...definition.size } };
  }


  setDisplaySurfaceMedia(sceneObjectId:string, source:string|undefined, options:{brightness:number;fit:string;flipX:boolean;flipY:boolean;rotation:number}):void {
    const runtime=this.sceneObjects.get(sceneObjectId);
    if(!runtime)return;
    if(!source){
      runtime.videoTexture?.dispose();
      runtime.displayMaterial?.dispose();
      runtime.videoTexture=undefined;
      runtime.displayMaterial=undefined;
      runtime.displaySource=undefined;
      runtime.mesh.material=runtime.baseMaterial;
      return;
    }
    const needsNewSource=runtime.displaySource!==source || !runtime.videoTexture || !runtime.displayMaterial;
    if(needsNewSource){
      runtime.videoTexture?.dispose();
      runtime.displayMaterial?.dispose();
      const material=new PBRMaterial(sceneObjectId+"-display-material",this.scene);
      material.metallic=0;
      material.roughness=1;
      try {
        const texture=new VideoTexture(sceneObjectId+"-video",source,this.scene,true,true,Texture.TRILINEAR_SAMPLINGMODE,{autoPlay:true,muted:true,loop:true});
        runtime.videoTexture=texture;
        runtime.displayMaterial=material;
        runtime.displaySource=source;
        material.albedoTexture=texture;
        material.emissiveTexture=texture;
        runtime.mesh.material=material;
      } catch {
        material.dispose();
        runtime.mesh.material=runtime.baseMaterial;
        runtime.displaySource=undefined;
        return;
      }
    }
    const texture=runtime.videoTexture;
    const material=runtime.displayMaterial;
    if(!texture || !material)return;
    texture.uScale=options.flipX?-1:1;
    texture.vScale=options.flipY?-1:1;
    texture.wAng=options.rotation*Math.PI/180;
    if(options.fit==="fill"){ texture.uScale*=1.08; texture.vScale*=1.08; }
    material.emissiveColor=new Color3(options.brightness,options.brightness,options.brightness);
  }

  cameraSnapshot(): CustomCamera {
    return this.planRestoreCamera
      ? { ...this.planRestoreCamera, position: { ...this.planRestoreCamera.position }, target: { ...this.planRestoreCamera.target } }
      : this.captureCamera("CURRENT");
  }

  restoreCamera(camera: CustomCamera): void {
    this.applyCustomCamera(camera);
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

  setPlanView(enabled: boolean): void {
    if (enabled) {
      if (this.camera.mode !== Camera.ORTHOGRAPHIC_CAMERA) this.planRestoreCamera = this.cameraSnapshot();
      this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      const span = Math.max(this.dimensions.roomWidth, this.dimensions.roomDepth) * 0.58;
      const aspect = this.engine.getRenderWidth() / Math.max(this.engine.getRenderHeight(), 1);
      this.camera.orthoTop = span;
      this.camera.orthoBottom = -span;
      this.camera.orthoLeft = -span * aspect;
      this.camera.orthoRight = span * aspect;
      this.camera.setPosition(new Vector3(0, this.dimensions.ceilingHeight + 10, this.dimensions.stageDepth - this.dimensions.roomDepth / 2));
      this.camera.setTarget(new Vector3(0, 0, this.dimensions.stageDepth - this.dimensions.roomDepth / 2));
    } else {
      this.camera.mode = Camera.PERSPECTIVE_CAMERA;
      if (this.planRestoreCamera) {
        const restore=this.planRestoreCamera;
        this.planRestoreCamera=null;
        this.restoreCamera(restore);
      }
    }
  }

  setView(preset: ViewPreset): void {
    if (preset === "free") return;
    const pose = getCameraPose(preset, this.dimensions);
    this.camera.setPosition(new Vector3(pose.position.x, pose.position.y, pose.position.z));
    this.camera.setTarget(new Vector3(pose.target.x, pose.target.y, pose.target.z));
  }

  setTool(tool: TransformTool): void {
    this.activeTool = tool;
    this.gizmos.positionGizmoEnabled = tool === "move";
    this.gizmos.rotationGizmoEnabled = tool === "rotate";
    if (tool === "select") {
      this.gizmos.attachToNode(null);
    } else if (this.selectedId) {
      this.gizmos.attachToNode(this.fixtures.get(this.selectedId)?.root ?? null);
    } else if (this.selectedObjectId) {
      this.gizmos.attachToMesh(this.sceneObjects.get(this.selectedObjectId)?.mesh ?? null);
    }
  }

  selectFixture(id: string, additive = false): void {
    const runtime = this.fixtures.get(id);
    if (!runtime) return;
    this.selectedObjectId = null;
    this.onSceneObjectSelect?.(null);
    if (!additive) this.selectedIds.clear();
    if (additive && this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.selectedId = this.selectedIds.has(id) ? id : ([...this.selectedIds].at(-1) ?? null);
    if (this.activeTool !== "select") {
      this.gizmos.attachToNode(this.selectedId ? this.fixtures.get(this.selectedId)?.root ?? null : null);
    }
    if (this.selectedId) this.emitSelection(this.fixtures.get(this.selectedId)!);
    else this.onSelection?.(null);
  }

  getSelectedFixtureIds(): string[] { return [...this.selectedIds]; }

  setSnap(enabled: boolean, step = this.snapStep): void {
    this.snapEnabled = enabled;
    this.snapStep = Math.max(0.01, step);
     const snap = enabled ? this.snapStep : 0;
    if (this.gizmos.gizmos.positionGizmo) this.gizmos.gizmos.positionGizmo.snapDistance = snap;
    if (this.gizmos.gizmos.rotationGizmo) this.gizmos.gizmos.rotationGizmo.snapDistance = enabled ? Math.PI / 12 : 0;
  }

  selectAllFixtures(): void {
    this.selectedIds = new Set(this.fixtures.keys());
    this.selectedId = [...this.selectedIds].at(-1) ?? null;
    if (this.selectedId) this.emitSelection(this.fixtures.get(this.selectedId)!);
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.selectedId = null;
    this.selectedObjectId = null;
    this.onSceneObjectSelect?.(null);
    this.gizmos.attachToNode(null);
    this.onSelection?.(null);
  }

  updateFixtureTransform(id: string, position?: {x:number;y:number;z:number}, rotation?: {x:number;y:number;z:number}): void {
    const runtime=this.fixtures.get(id);
    if(!runtime)return;
    if(position){
      runtime.root.position.set(position.x,position.y,position.z);
      runtime.definition.position={...position};
    }
    if(rotation){
      runtime.root.rotation.set(rotation.x*Math.PI/180,rotation.y*Math.PI/180,rotation.z*Math.PI/180);
      runtime.definition.rotation={...rotation};
    }
    if(this.selectedId===id)this.emitSelection(runtime);
  }

  updateSelectedPosition(axis: "x" | "y" | "z", value: number): void {
    if (!this.selectedId) return;
    const runtime = this.fixtures.get(this.selectedId);
    if (!runtime) return;
    runtime.root.position[axis] = value;
    runtime.definition.position[axis] = value;
    this.emitSelection(runtime);
    this.onFixtureTransform?.({
      ...runtime.definition,
      position: { ...runtime.definition.position },
      rotation: { ...runtime.definition.rotation },
      patch: { ...runtime.definition.patch }
    });
  }

  updateSelectedRotation(axis: "x" | "y" | "z", degrees: number): void {
    if (!this.selectedId) return;
    const runtime = this.fixtures.get(this.selectedId);
    if (!runtime) return;
    runtime.root.rotation[axis] = degrees * Math.PI / 180;
    runtime.definition.rotation[axis] = degrees;
    this.emitSelection(runtime);
    this.onFixtureTransform?.({
      ...runtime.definition,
      position: { ...runtime.definition.position },
      rotation: { ...runtime.definition.rotation },
      patch: { ...runtime.definition.patch }
    });
  }

  private syncSelectedTransform(): void {
    if (this.activeTool === "select") return;

    if (this.selectedObjectId) {
      const objectRuntime = this.sceneObjects.get(this.selectedObjectId);
      if (!objectRuntime) return;
      const position = { x: objectRuntime.mesh.position.x, y: objectRuntime.mesh.position.y, z: objectRuntime.mesh.position.z };
      const rotation = {
        x: objectRuntime.mesh.rotation.x * 180 / Math.PI,
        y: objectRuntime.mesh.rotation.y * 180 / Math.PI,
        z: objectRuntime.mesh.rotation.z * 180 / Math.PI
      };
      const next: SceneObject = {
        ...objectRuntime.definition,
        position,
        rotation,
        size: { ...objectRuntime.definition.size }
      };
      objectRuntime.definition = next;
      this.onSceneObjectTransform?.(next);
      return;
    }

    if (!this.selectedId) return;
    const runtime = this.fixtures.get(this.selectedId);
    if (!runtime) return;

    const beforePosition = { ...runtime.definition.position };
    const beforeRotation = { ...runtime.definition.rotation };
    const position = { x: runtime.root.position.x, y: runtime.root.position.y, z: runtime.root.position.z };
    const rotation = {
      x: runtime.root.rotation.x * 180 / Math.PI,
      y: runtime.root.rotation.y * 180 / Math.PI,
      z: runtime.root.rotation.z * 180 / Math.PI
    };
    const epsilon = 0.0001;
    const changed =
      Math.abs(position.x - beforePosition.x) > epsilon ||
      Math.abs(position.y - beforePosition.y) > epsilon ||
      Math.abs(position.z - beforePosition.z) > epsilon ||
      Math.abs(rotation.x - beforeRotation.x) > epsilon ||
      Math.abs(rotation.y - beforeRotation.y) > epsilon ||
      Math.abs(rotation.z - beforeRotation.z) > epsilon;
    if (!changed) return;

    const deltaPosition = {
      x: position.x - beforePosition.x,
      y: position.y - beforePosition.y,
      z: position.z - beforePosition.z
    };
    const deltaRotation = {
      x: rotation.x - beforeRotation.x,
      y: rotation.y - beforeRotation.y,
      z: rotation.z - beforeRotation.z
    };

    for (const id of this.selectedIds) {
      const selectedRuntime = this.fixtures.get(id);
      if (!selectedRuntime) continue;
      if (id === this.selectedId) {
        selectedRuntime.definition.position = position;
        selectedRuntime.definition.rotation = rotation;
      } else {
        selectedRuntime.root.position.addInPlace(new Vector3(deltaPosition.x, deltaPosition.y, deltaPosition.z));
        selectedRuntime.root.rotation.x += deltaRotation.x * Math.PI / 180;
        selectedRuntime.root.rotation.y += deltaRotation.y * Math.PI / 180;
        selectedRuntime.root.rotation.z += deltaRotation.z * Math.PI / 180;
        selectedRuntime.definition.position = {
          x: selectedRuntime.definition.position.x + deltaPosition.x,
          y: selectedRuntime.definition.position.y + deltaPosition.y,
          z: selectedRuntime.definition.position.z + deltaPosition.z
        };
        selectedRuntime.definition.rotation = {
          x: selectedRuntime.definition.rotation.x + deltaRotation.x,
          y: selectedRuntime.definition.rotation.y + deltaRotation.y,
          z: selectedRuntime.definition.rotation.z + deltaRotation.z
        };
      }
      this.onFixtureTransform?.({
        ...selectedRuntime.definition,
        position: { ...selectedRuntime.definition.position },
        rotation: { ...selectedRuntime.definition.rotation },
        patch: { ...selectedRuntime.definition.patch }
      });
    }
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

      let color = Color3.FromHexString(runtime.color);
      if (state.emitters) {
        const e = state.emitters;
        // Approximate additive fixture emitters for visualization only.
        // White is neutral, amber is warm orange, UV is represented as violet spill.
        color = new Color3(
          e.red + e.white + e.amber * 1.0 + e.uv * 0.22,
          e.green + e.white + e.amber * 0.48,
          e.blue + e.white + e.amber * 0.08 + e.uv * 0.82
        );
        const peak = Math.max(color.r, color.g, color.b, 1);
        color = color.scale(1 / peak);
      }
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
