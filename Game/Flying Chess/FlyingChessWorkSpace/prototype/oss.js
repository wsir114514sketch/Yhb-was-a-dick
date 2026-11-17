import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * 开源骰子对照：把 dice-box-threejs（MIT，Cannon 物理）自带的一套材质贴图直接贴在同一个骰子上，
 * 看看“开源 3D 骰子”的观感上限长什么样。这里仍然不跑物理——只做静态姿态，便于与 A/B/C 比较。
 */

const PIP_LAYOUT = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.24, 0.24], [0.5, 0.5], [0.76, 0.76]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]]
};

const FACE_VALUES = [3, 4, 5, 2, 1, 6];
const loader = new THREE.TextureLoader();

function tileTexture(url) {
  return new Promise((resolve) => {
    loader.load(url, (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(0.5, 0.5);
      texture.colorSpace = THREE.SRGBColorSpace;
      resolve(texture);
    }, undefined, () => resolve(null));
  });
}

/** 在材质图上叠点数：底色来自开源贴图（平铺后取一块），点数按面绘制。 */
function faceCanvas({ value, base }) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (base) {
    // 用贴图缩放铺满一面：每面取贴图的同一区域，保证相邻面纹路衔接自然。
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(((value * 37) % 4) * Math.PI / 2);
    ctx.drawImage(base, -size, -size, size * 2, size * 2);
    ctx.restore();
    // 轻微压暗，让白点读得出来。
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.fillStyle = "#efe9dd";
    ctx.fillRect(0, 0, size, size);
  }

  const radius = value === 1 ? size * 0.105 : size * 0.082;
  for (const [x, y] of PIP_LAYOUT[value]) {
    ctx.beginPath();
    ctx.arc(x * size, y * size, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#fbf8f1";
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)";
    ctx.lineWidth = size * 0.008;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

async function buildDie(textureUrl, stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(5.2, 4.0, 6.6);
  camera.lookAt(0, 0.05, 0);

  const resize = () => {
    const size = Math.max(1, Math.round(stage.getBoundingClientRect().width));
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfb6a6, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 6, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-4, 1.5, -3);
  scene.add(fill);

  const base = await tileTexture(textureUrl);
  const geometry = new RoundedBoxGeometry(1.9, 1.9, 1.9, 5, 0.14);
  const materials = FACE_VALUES.map((value) => new THREE.MeshLambertMaterial({
    map: faceCanvas({ value, base: base?.image ?? null })
  }));

  const die = new THREE.Mesh(geometry, materials);
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.55, 0, 0.835),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0.835, 0, -0.55)
  );
  die.quaternion.setFromRotationMatrix(basis);
  die.position.y = 0.16;
  scene.add(die);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 40),
    new THREE.MeshBasicMaterial({ color: 0x8b8172, transparent: true, opacity: 0.17, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.93;
  shadow.scale.set(1, 0.62, 1);
  scene.add(shadow);

  new ResizeObserver(resize).observe(stage);
  resize();
  renderer.render(scene, camera);

  return { renderer, scene, camera };
}

const handles = [];
for (const card of document.querySelectorAll(".card[data-tex]")) {
  const stage = card.querySelector(".stage");
  handles.push(await buildDie(card.dataset.tex, stage));
}

let visible = true;
document.addEventListener("visibilitychange", () => { visible = !document.hidden; });

function tick() {
  if (visible) for (const h of handles) h.renderer.render(h.scene, h.camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.__openSourceDiceReady = true;
