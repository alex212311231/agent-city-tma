import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const path = name => new URL('public/assets/' + name, import.meta.url).href;
const figures = ['walker', 'hiker', 'regular'];

export function createAssets(renderer, scene) {
  const basis = new KTX2Loader().setTranscoderPath(path('')).setWorkerLimit(2).detectSupport(renderer);
  const models = new GLTFLoader().setKTX2Loader(basis).setMeshoptDecoder(MeshoptDecoder);
  const textures = new THREE.TextureLoader();
  const pending = new Map();
  const report = (name, error) => console.error('Не удалось загрузить ресурс города ' + name, error);
  function load(name) {
    if (!pending.has(name)) {
      const resource = models.loadAsync(path(name + '.glb')).then(model => {
        model.scene.updateMatrixWorld();
        return model;
      });
      pending.set(name, resource);
    }
    return pending.get(name);
  }

  function texture(name, repeat, colorSpace = THREE.NoColorSpace) {
    const map = textures.load(path(name), undefined, undefined, error => report(name, error));
    map.colorSpace = colorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(repeat, repeat);
    map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return map;
  }

  const themed = {
    asphalt: new THREE.MeshStandardMaterial({
      color: 0x677484, roughness: .48, metalness: .11, envMapIntensity: 1.1,
      map: texture('asphalt-diff.jpg', 81, THREE.SRGBColorSpace),
      normalMap: texture('asphalt-nor_gl.jpg', 81),
      normalScale: new THREE.Vector2(.42, .42),
      roughnessMap: texture('asphalt-rough.jpg', 81),
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0xc69e78, roughness: .66, map: texture('wood.jpg', 3, THREE.SRGBColorSpace),
    }),
    concrete: new THREE.MeshStandardMaterial({
      color: 0xc9d0d9, roughness: .87, map: texture('concrete.jpg', 1, THREE.SRGBColorSpace),
    }),
  };

  void new RGBELoader().loadAsync(path('urban-dusk.hdr')).then(hdr => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.background = hdr;
    scene.backgroundBlurriness = .36;
    scene.environmentRotation.y = scene.backgroundRotation.y = .72;
  }).catch(error => report('urban-dusk.hdr', error));

  function place(parent, name, { x = 0, y = 0, z = 0, yaw = 0, height, width, depth, onReady } = {}) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(x,y,z);
    group.rotation.y = yaw;
    parent.add(group);
    void load(name).then(({ scene: original }) => {
      const object = original.clone();
      const bounds = new THREE.Box3().setFromObject(object);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = height ? height / size.y : 1;
      object.scale.set(width ? width / size.x : scale, scale, depth ? depth / size.z : scale);
      const center = bounds.getCenter(new THREE.Vector3());
      object.position.set(-center.x, -bounds.min.y, -center.z).multiply(object.scale);
      group.add(object);
      onReady?.(object);
    }).catch(error => report(name, error));
    return group;
  }

  function instance(parent, name, placements, finish = material => material) {
    const visible = placements.map(() => true);
    const transforms = [];
    const meshes = [];
    const hidden = new THREE.Matrix4().makeScale(0,0,0);
    const matrix = new THREE.Matrix4();
    function show(index,value) {
      visible[index]=value;
      for(const {batch,source} of meshes) {
        batch.setMatrixAt(index,value?matrix.multiplyMatrices(transforms[index],source):hidden);
        batch.instanceMatrix.needsUpdate=true;
      }
    }
    void load(name).then(({scene: model}) => {
      const bounds=new THREE.Box3().setFromObject(model);
      const center=bounds.getCenter(new THREE.Vector3());
      const size=bounds.getSize(new THREE.Vector3());
      const steer=new THREE.Object3D();
      const foot=new THREE.Vector3(-center.x,-bounds.min.y,-center.z);
      const offset=new THREE.Matrix4().makeTranslation(foot.x,foot.y,foot.z);
      for(const {x,y=.15,z,yaw=0,width,height,depth} of placements){
        steer.position.set(x,y,z);
        steer.rotation.y=yaw;
        const scale=height?height/size.y:1;
        steer.scale.set(width?width/size.x:scale,scale,depth?depth/size.z:scale);
        steer.updateMatrix();
        transforms.push(steer.matrix.clone().multiply(offset));
      }
      model.traverse(source=>{
        if(!source.isMesh)return;
        const material=Array.isArray(source.material)?source.material.map(finish):finish(source.material);
        const batch=new THREE.InstancedMesh(source.geometry,material,placements.length);
        for(const [index,transform] of transforms.entries()) {
          batch.setMatrixAt(index,visible[index]?matrix.multiplyMatrices(transform,source.matrixWorld):hidden);
        }
        batch.frustumCulled=false;
        parent.add(batch);
        meshes.push({batch,source:source.matrixWorld});
      });
    }).catch(error=>report(name,error));
    return {show};
  }

  const toLocal = new THREE.Quaternion();
  const turn = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  const current = new THREE.Vector3();
  const neutral = new THREE.Quaternion();
  const up = new THREE.Vector3(0,1,0);
  function aim(root, bone, x, y, z, weight = 1) {
    bone.parent.getWorldQuaternion(toLocal).invert();
    root.getWorldQuaternion(turn);
    direction.set(x,y,z).normalize().applyQuaternion(turn).applyQuaternion(toLocal);
    current.copy(up).applyQuaternion(bone.quaternion);
    turn.setFromUnitVectors(current, direction).slerp(neutral, 1 - weight);
    bone.quaternion.premultiply(turn);
  }

  function character(root, variation, height = 1.75) {
    const name = figures[variation % figures.length];
    let rig, mixer, bones, active, walk, idle;
    const hands = new THREE.Group();
    const wrist = new THREE.Vector3();
    let poseBlend = 0;
    root.add(hands);
    void load(name).then(({ scene: model, animations }) => {
      rig = cloneSkeleton(model);
      const bounds = new THREE.Box3().setFromObject(rig);
      rig.scale.setScalar(height / (bounds.max.y - bounds.min.y));
      // This skeleton's clips are already centered on the feet and face +Z.
      root.add(rig);
      mixer = new THREE.AnimationMixer(rig);
      const clip = name => mixer.clipAction(THREE.AnimationClip.findByName(animations, name));
      idle = clip('idle').play();
      walk = clip('walk');
      active = idle;
      bones = {};
      for (const part of ['hips','upperarm','forearm','hand','thigh','calf','foot','toe']) {
        for (const side of (part === 'hips' ? [''] : ['_L','_R'])) {
          const key = part + side;
          bones[key] = rig.getObjectByName(key);
        }
      }
      if (variation % 3) idle.time = (variation * .83) % idle.getClip().duration;
      hands.visible = true;
    }).catch(error => report(name, error));
    hands.visible = false;

    function update(dt, mode, travelSpeed = 1.45, time = 0) {
      if (!rig) return;
      const moving = mode === 'walk' || mode === 'carry-walk';
      const next = moving ? walk : idle;
      if (active !== next) {
        next.reset().setEffectiveWeight(1).fadeIn(.16).play();
        active.fadeOut(.16);
        active = next;
      }
      if (moving) walk.timeScale = THREE.MathUtils.clamp(travelSpeed / 1.45, .65, 2);
      mixer.update(dt);
      const working = mode === 'typing';
      poseBlend = dt ? THREE.MathUtils.damp(poseBlend, Number(working), 14, dt) : Number(working);
      rig.position.y = -.40 * poseBlend;
      if (poseBlend > .002) {
        for (const side of ['_L','_R']) {
          const sign = side === '_L' ? 1 : -1;
          aim(root,bones['thigh'+side],.10*sign,-.12,1,poseBlend);
          aim(root,bones['calf'+side],0,-1,-.1,poseBlend);
          aim(root,bones['foot'+side],0,-.1,1,poseBlend);
          aim(root,bones['upperarm'+side],-.12*sign,-.82,.40,poseBlend);
          aim(root,bones['forearm'+side],-.17*sign,-.08,1,poseBlend);
          aim(root,bones['hand'+side],0,-.05+.12*Math.sin(time*20+sign),1,poseBlend);
        }
      }
      if (mode.startsWith('carry') || mode === 'gesture') {
        aim(root,bones.upperarm_R,-.06,-1,.30);
        aim(root,bones.forearm_R,.16,mode === 'gesture' ? .55+.18*Math.sin(time*4) : .28,1);
      }
      if (mode.startsWith('carry')) {
        bones.hand_R.getWorldPosition(wrist);
        hands.position.copy(root.worldToLocal(wrist));
      }
    }
    return { hands, update };
  }

  return { place, character, instance, materials: themed };
}

export function createPipeline(renderer, scene) {
  const composer = new EffectComposer(renderer);
  const world = new RenderPass(scene, new THREE.PerspectiveCamera());
  composer.addPass(world);
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(1,1), .24, .49, 1.16));
  composer.addPass(new OutputPass());
  // SMAA expects tone-mapped sRGB colors and writes them without another output transform.
  composer.addPass(new SMAAPass());
  return {
    resize(width, height) { composer.setSize(width, height); },
    render(camera) {
      world.camera = camera;
      composer.render();
    },
  };
}
