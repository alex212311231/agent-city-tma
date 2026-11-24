// This function runs in the page. Its inputs come from the browser's local module override.
export function inspectScene({ baseline }) {
  const { THREE, scene, actors, rooms, places, navigation, travel, walls, bounding } = window.cityAudit;
  const issues = [];
  const overlaps = [];
  const counts = { assets: 0, textures: 0, actors: 0, homes: 0, rooms: rooms.length, rays: 0, routes: 0 };
  const textures = new Map();
  const rootNames = new Set(['chair','desk','reception','meeting','lounge','plant','servers','archive','coffee','tree','water-tower']);
  const textureSlots = ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','alphaMap','aoMap','lightMap','bumpMap','displacementMap'];
  const size = new THREE.Vector3();
  const box = new THREE.Box3();
  const pivot = new THREE.Vector3();

  function inspectTexture(owner, slot, texture) {
    if (!texture?.isTexture) return;
    const prior = textures.get(texture) ?? new Set();
    if (!prior.size) counts.textures++;
    if (prior.has(slot)) return;
    prior.add(slot);
    textures.set(texture, prior);
    const source = texture.image?.[0] ?? texture.image;
    if (!source || !(source.width > 0 && source.height > 0)) issues.push(['texture missing pixels', owner, slot]);
    if (['normalMap','roughnessMap','metalnessMap','aoMap','bumpMap','displacementMap'].includes(slot)
        && texture.colorSpace !== THREE.NoColorSpace) {
      issues.push(['data texture has a color transfer function', owner, slot, texture.colorSpace]);
    }
  }

  scene.updateMatrixWorld(true);
  inspectTexture('scene', 'environment', scene.environment);
  inspectTexture('scene', 'background', scene.background);
  scene.traverse(node => {
    const owner = node.name || node.parent?.name || node.type;
    for (const material of [].concat(node.material ?? [])) {
      for (const slot of textureSlots) inspectTexture(owner, slot, material[slot]);
    }
    if (!rootNames.has(node.name) || !node.isGroup || !node.children[0]?.isGroup) return;
    counts.assets++;
    node.getWorldPosition(pivot);
    box.setFromObject(node, true).getSize(size);
    if (!Number.isFinite(size.lengthSq()) || size.y > 16 || Math.abs(box.min.y-pivot.y) > .025) {
      issues.push(['invalid model dimensions', owner, size.toArray(), box.min.y-pivot.y]);
    }
  });

  const principal = actors.filter(actor => !actor.profile.job);
  const actorMeshes = new Set();
  for (const actor of actors) {
    const meshes = actor.wrapper.getObjectsByProperty('isSkinnedMesh', true);
    for (const mesh of meshes) actorMeshes.add(mesh);
    if (actor.profile.job && !meshes.length) continue;
    counts.actors++;
    if (meshes.length !== 1) {
      issues.push(['agent rig count', actor.profile.id, meshes.length]);
      continue;
    }
    box.setFromObject(meshes[0], true).getSize(size);
    if (!(size.y > 1.28 && size.y < 2.04)) issues.push(['agent outside height bounds', actor.profile.id, size.y]);
  }
  const homes = [...places.values()].filter(place => place.id.startsWith('home-'));
  if (!baseline) {
    const extra = scene.getObjectsByProperty('isSkinnedMesh', true).filter(node => !actorMeshes.has(node));
    if (extra.length) issues.push(['anonymous humanoid rigs', extra.length]);
    counts.homes = homes.length;
    if (homes.length !== principal.length) issues.push(['agents and homes disagree', principal.length, homes.length]);
    for (const actor of principal) {
      const home = places.get('home-' + actor.profile.id);
      if (!home?.bounds || !home?.entry || !home?.work) issues.push(['agent missing house, bounds or entrance', actor.profile.id]);
    }
    for (const [i, home] of homes.entries()) {
      for (const other of homes.slice(i+1)) {
        if (home.bounds.intersectsBox(other.bounds)) issues.push(['overlapping homes', home.id, other.id]);
      }
    }
  }

  const ray = new THREE.Raycaster();
  for (const room of rooms) {
    for (const [i, floor] of room.office.floors.entries()) {
      const group = room.office.root.getObjectByName('office-level-'+i);
      const deck = group.getObjectByName('office-floor-slab');
      const ceiling = group.getObjectByName('office-ceiling').children[0];
      for (const x of [-room.width/2+.02,-4,.3,8,room.width/2-.02]) {
        for (const z of [-room.depth/2+.02,-5,0,5,room.depth/2-.02]) {
          const origin = new THREE.Vector3(room.x+x,floor+1.8,room.z+z);
          for (const [surface, sign] of [[deck,-1],[ceiling,1]]) {
            ray.set(origin,new THREE.Vector3(0,sign,0));
            ray.far = 3.2;
            counts.rays++;
            if (!ray.intersectObject(surface).length) issues.push(['gap in slab', room.id, i, sign, x, z]);
          }
        }
      }
    }
  }

  // Intersections at the same depth with the same facing plane and different
  // objects are candidates, not confirmed artifacts. Check the screenshots.
  const solidSurfaces = [];
  scene.traverseVisible(mesh => {
    if (mesh.isMesh && !mesh.isSkinnedMesh && ![].concat(mesh.material).some(material => material.transparent)) {
      solidSurfaces.push(mesh);
    }
  });
  ray.far = 25;
  function sampleDepth(origin, heading, surfaces) {
    ray.set(origin,heading);
    const [first, ...others] = ray.intersectObjects(surfaces,false);
    if (!first) return;
    for (const next of others) {
      if (next.distance-first.distance > .003) break;
      if (next.object === first.object && next.instanceId === first.instanceId) continue;
      overlaps.push([origin.toArray(), (next.distance-first.distance).toFixed(5),
        first.object.name || first.object.parent?.name || first.object.type,
        next.object.name || next.object.parent?.name || next.object.type]);
    }
  }
  for (const x of [-30.13,-12.27,-6.66,-1.29,.33,2.91,6.74,13.37,28.63]) {
    for (const z of [-30.19,-14.37,-6.75,-1.21,.67,1.77,6.66,13.92,28.83]) {
      sampleDepth(new THREE.Vector3(x,14.5,z),new THREE.Vector3(0,-1,0),solidSurfaces);
    }
  }
  for(const home of homes){
    const surfaces=solidSurfaces.filter(mesh=>mesh.parent===home.root);
    for(const offset of [-1.71,-1.14,-.73,.14,.61,1.14,1.7]){
      for(const y of [1.01,1.89,2.47,3.17,3.99,5.04]){
        sampleDepth(new THREE.Vector3(home.x+offset,y,home.z-7.4),new THREE.Vector3(0,0,1),surfaces);
      }
    }
  }

  for (const origin of places.values()) {
    for (const destination of places.values()) {
      if (origin === destination || (origin.id.startsWith('home-') && destination.id.startsWith('home-'))) continue;
      for (const byCar of [false, true]) {
        const route = travel(origin,destination,byCar);
        counts.routes++;
        if (!route?.length) {
          issues.push(['route missing', origin.id, destination.id, byCar]);
          continue;
        }
        for (const [i, segment] of route.entries()) {
          if (!i) continue;
          const from = route[i-1].point.clone();
          const to = segment.point.clone();
          from.y = to.y = segment.drive ? navigation.roadHeight+.78 : 1.03;
          const obstacles = segment.drive ? bounding : walls;
          if (navigation.sweep(THREE,from,to,obstacles,segment.drive?1.1:.24).distanceToSquared(to) > .002) {
            issues.push(['solid on route',origin.id,destination.id,byCar,from.toArray(),to.toArray()]);
          }
        }
      }
    }
  }
  return { counts, issues, overlapCandidates: overlaps.slice(0, 20), overlapCount: overlaps.length };
}
