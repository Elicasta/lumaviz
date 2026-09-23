import { Color3 } from "@babylonjs/core/Maths/math.color";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { MaterialPreset } from "./types";

export interface SceneMaterials {
  floor: PBRMaterial;
  wall: PBRMaterial;
  stage: PBRMaterial;
  drape: PBRMaterial;
  screen: PBRMaterial;
  fixture: PBRMaterial;
}

function pbr(scene: Scene, name: string, color: Color3, roughness: number, metallic = 0): PBRMaterial {
  const material = new PBRMaterial(name, scene);
  material.albedoColor = color;
  material.roughness = roughness;
  material.metallic = metallic;
  return material;
}

export function createSceneMaterials(scene: Scene, preset: MaterialPreset): SceneMaterials {
  if (preset === "ballroom") {
    return {
      floor: pbr(scene, "floor", Color3.FromHexString("#3a312b"), 0.72),
      wall: pbr(scene, "wall", Color3.FromHexString("#b7aa98"), 0.68),
      stage: pbr(scene, "stage", Color3.FromHexString("#171717"), 0.92),
      drape: pbr(scene, "drape", Color3.FromHexString("#100b0d"), 1),
      screen: pbr(scene, "screen", Color3.FromHexString("#d9dde2"), 0.82),
      fixture: pbr(scene, "fixture", Color3.FromHexString("#111214"), 0.42, 0.28)
    };
  }

  if (preset === "black-box") {
    return {
      floor: pbr(scene, "floor", Color3.FromHexString("#0c0d0e"), 0.95),
      wall: pbr(scene, "wall", Color3.FromHexString("#08090a"), 0.9),
      stage: pbr(scene, "stage", Color3.FromHexString("#111214"), 0.98),
      drape: pbr(scene, "drape", Color3.FromHexString("#050506"), 1),
      screen: pbr(scene, "screen", Color3.FromHexString("#bcc1c8"), 0.86),
      fixture: pbr(scene, "fixture", Color3.FromHexString("#0b0c0d"), 0.38, 0.34)
    };
  }

  return {
    floor: pbr(scene, "floor", Color3.FromHexString("#1b1c1f"), 0.87),
    wall: pbr(scene, "wall", Color3.FromHexString("#24272b"), 0.86),
    stage: pbr(scene, "stage", Color3.FromHexString("#121315"), 0.96),
    drape: pbr(scene, "drape", Color3.FromHexString("#090a0b"), 1),
    screen: pbr(scene, "screen", Color3.FromHexString("#d5d8dd"), 0.88),
    fixture: pbr(scene, "fixture", Color3.FromHexString("#0c0d0f"), 0.36, 0.38)
  };
}
