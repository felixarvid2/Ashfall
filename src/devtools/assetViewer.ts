/**
 * Dev-only asset viewer (brief §9.2 step 7): browse every asset with its status,
 * polygon count and file size, inspect preview/refined/optimized models in 3D,
 * play animation clips, and approve or reject them. Talks to tools/assetViewerPlugin.ts.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AssetEntry, AssetManifest } from '../data/assetManifest';

const list = document.querySelector<HTMLElement>('#list')!;
const info = document.querySelector<HTMLElement>('#info')!;
const summary = document.querySelector<HTMLElement>('#summary')!;
const empty = document.querySelector<HTMLElement>('#empty')!;
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a181b');
scene.add(new THREE.HemisphereLight('#c8d0e0', '#30281f', 1.2));
const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.position.set(3, 5, 4);
scene.add(key);
const grid = new THREE.GridHelper(10, 10, '#4a4038', '#2a2622');
scene.add(grid);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
const controls = new OrbitControls(camera, canvas);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const clock = new THREE.Clock();
let current: THREE.Object3D | null = null;
let mixer: THREE.AnimationMixer | null = null;
let manifest: AssetManifest;
let selected: string | null = null;

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

renderer.setAnimationLoop(() => {
  mixer?.update(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
});

function sources(a: AssetEntry): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  if (a.file) out.push({ label: 'Optimized (in game)', url: `./assets/${a.file}` });
  if (a.meshy.animationTaskId) out.push({ label: 'Animated (raw)', url: `/__assets/source/${a.id}/animated.glb` });
  if (a.meshy.refineTaskId) out.push({ label: 'Refined (raw)', url: `/__assets/source/${a.id}/refined.glb` });
  if (a.meshy.previewTaskId) out.push({ label: 'Preview (raw)', url: `/__assets/source/${a.id}/preview.glb` });
  return out;
}

function thumb(a: AssetEntry): string | null {
  if (a.meshy.refineTaskId) return `/__assets/source/${a.id}/refined.png`;
  if (a.meshy.previewTaskId) return `/__assets/source/${a.id}/preview.png`;
  return null;
}

async function load(): Promise<void> {
  manifest = (await (await fetch('/__assets/manifest')).json()) as AssetManifest;
  const spent = manifest.assets.reduce((s, a) => s + (a.meshy.creditsSpent ?? 0), 0);
  const counts = manifest.assets.reduce<Record<string, number>>((m, a) => ((m[a.status] = (m[a.status] ?? 0) + 1), m), {});
  summary.textContent = `${manifest.assets.length} assets · ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')} · ${spent} credits spent`;
  list.replaceChildren(
    ...manifest.assets.map((a) => {
      const row = document.createElement('div');
      row.className = `row${a.id === selected ? ' sel' : ''}`;
      const t = thumb(a);
      const img = t ? Object.assign(document.createElement('img'), { src: t, alt: '' }) : document.createElement('div');
      if (!t) img.className = 'noimg';
      const text = document.createElement('div');
      text.innerHTML = `<div class="id"></div><div class="meta"></div>`;
      text.querySelector('.id')!.textContent = a.id;
      text.querySelector('.meta')!.textContent = a.stats
        ? `${a.stats.triangles.toLocaleString()} tris · ${(a.stats.bytes / 1024).toFixed(0)} KB${a.meshy.clips ? ` · ${Object.keys(a.meshy.clips).length} clips` : ''}`
        : `target ${a.targetPolycount.toLocaleString()} tris${a.meshy.previewApproved ? ' · preview approved' : ''}`;
      const badge = document.createElement('span');
      badge.className = `badge ${a.status}`;
      badge.textContent = a.status;
      row.append(img, text, badge);
      row.addEventListener('click', () => select(a.id));
      return row;
    }),
  );
  if (selected) showInfo(manifest.assets.find((a) => a.id === selected)!);
}

async function select(id: string): Promise<void> {
  selected = id;
  for (const row of list.children) row.classList.toggle('sel', row.querySelector('.id')?.textContent === id);
  const a = manifest.assets.find((x) => x.id === id)!;
  showInfo(a);
  const src = sources(a)[0];
  if (src) await show(src.url);
  else clearModel('No model generated yet');
}

function clearModel(text: string): void {
  if (current) scene.remove(current);
  current = null;
  mixer = null;
  empty.textContent = text;
  empty.hidden = false;
}

async function show(url: string): Promise<void> {
  clearModel('Loading…');
  let gltf: GLTF;
  try {
    gltf = await loader.loadAsync(url);
  } catch (err) {
    clearModel(`Could not load ${url}: ${(err as Error).message}`);
    return;
  }
  empty.hidden = true;
  current = gltf.scene;
  scene.add(current);
  const box = new THREE.Box3().setFromObject(current);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z);
  camera.position.copy(center).add(new THREE.Vector3(radius * 1.2, radius * 0.8, radius * 1.6));
  controls.target.copy(center);
  grid.scale.setScalar(Math.max(0.2, radius / 4));
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(current);
    mixer.clipAction(gltf.animations[0]!).play();
    const clips = document.createElement('span');
    for (const clip of gltf.animations) {
      const b = document.createElement('button');
      b.textContent = `▶ ${clip.name}`;
      b.onclick = () => {
        mixer!.stopAllAction();
        mixer!.clipAction(clip).reset().play();
      };
      clips.appendChild(b);
    }
    info.querySelector('.clips')?.replaceChildren(clips);
  }
  const dims = info.querySelector('.dims');
  if (dims) dims.textContent = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m`;
}

function showInfo(a: AssetEntry): void {
  info.innerHTML = '';
  const title = Object.assign(document.createElement('strong'), { textContent: a.id });
  const pick = document.createElement('select');
  for (const s of sources(a)) pick.appendChild(Object.assign(document.createElement('option'), { value: s.url, textContent: s.label }));
  pick.onchange = () => show(pick.value);
  const dims = Object.assign(document.createElement('span'), { className: 'dims' });
  const clips = Object.assign(document.createElement('span'), { className: 'clips' });
  const msg = Object.assign(document.createElement('span'), { className: 'msg' });
  const act = (label: string, action: string, cls: string) => {
    const b = Object.assign(document.createElement('button'), { textContent: label, className: cls });
    b.onclick = async () => {
      if (action === 'reject' && !confirm(`Reject ${a.id}? It will be regenerated (costs credits).`)) return;
      const res = await fetch('/__assets/review', { method: 'POST', body: JSON.stringify({ id: a.id, action }) });
      msg.textContent = ((await res.json()) as { message: string }).message;
      await load();
    };
    return b;
  };
  const buttons: HTMLElement[] = [];
  if (a.status === 'preview' && !a.meshy.previewApproved) buttons.push(act('Approve preview', 'approve-preview', 'ok'));
  if (a.status === 'refined' || a.status === 'optimized') buttons.push(act('Approve', 'approve', 'ok'));
  if (a.status !== 'planned') buttons.push(act('Reject', 'reject', 'bad'));
  const prompt = Object.assign(document.createElement('div'), { className: 'prompt', textContent: a.prompt });
  info.append(title, pick, dims, clips, ...buttons, msg, prompt);
}

load();
