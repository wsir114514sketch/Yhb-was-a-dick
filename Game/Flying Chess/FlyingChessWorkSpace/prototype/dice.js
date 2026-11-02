import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * 骰子样式原型：同一几何、四种材质。
 * 只用于选型对比，正式实现会换成单张图集纹理（1 个 draw call）并做按需渲染。
 */

const PIP_LAYOUT = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.24, 0.24], [0.5, 0.5], [0.76, 0.76]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]]
};

/** 画一个骰面：底色、可选描边、圆点。 */
function faceTexture({ value, body, pip, stroke, size = 256 }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = body;
  ctx.fillRect(0, 0, size, size);

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = size * 0.018;
    ctx.strokeRect(size * 0.02, size * 0.02, size * 0.96, size * 0.96);
  }

  const radius = value === 1 ? size * 0.105 : size * 0.082;
  for (const [x, y] of PIP_LAYOUT[value]) {
    ctx.beginPath();
    ctx.arc(x * size, y * size, radius, 0, Math.PI * 2);
    ctx.fillStyle = pip;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const STYLES = {
  ivory: { body: "#efe9dd", pip: "#2a2724", stroke: null, edge: null },
  slate: { body: "#2f2c29", pip: "#f3ede1", stroke: null, edge: null },
  porcelain: { body: "#fbf9f5", pip: "#3a3632", stroke: "#d8d1c4", edge: "#c9c1b3" }
};

/** 立方体六面的点数，按 three.js BoxGeometry 材质顺序：+X, -X, +Y, -Y, +Z, -Z */
const FACE_VALUES = [3, 4, 5, 2, 1, 6];

function buildDie(styleName, stage) {
  const style = STYLES[styleName];

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  // 舞台宽度由 CSS 决定；面板刚挂载时可能还没有布局，所以尺寸跟着它走，而不是取一次快照。
  const resize = () => {
    const size = Math.max(1, Math.round(stage.getBoundingClientRect().width));
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  camera.position.set(5.2, 4.0, 6.6);
  camera.lookAt(0, 0.05, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xbfb6a6, 2.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 6, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-4, 1.5, -3);
  scene.add(fill);

  // 圆角立方体：棱角被磨掉一点，接近实体骰子，同时避免直角在缩略图里显得生硬。
  const geometry = new RoundedBoxGeometry(1.9, 1.9, 1.9, 5, 0.14);
  const materials = FACE_VALUES.map((value) => {
    const map = faceTexture({ value, body: style.body, pip: style.pip, stroke: style.stroke });
    return new THREE.MeshLambertMaterial({ map });
  });
  const die = new THREE.Mesh(geometry, materials);

  // 停在一个能同时看到三个面的姿态。做法是让三个本体轴分别指向三个相机方向：
  //   +Z 面(1点) → 朝相机，  +Y 面(5点) → 朝上，  +X 面(3点) → 朝右后。
  // 用矩阵直接构造，比猜欧拉角可靠；掷骰动画的终点也用它。
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0.55, 0, 0.835),   // 本体 +X（3 点）指向：右后方
    new THREE.Vector3(0, 1, 0),          // 本体 +Y（5 点）指向：正上方
    new THREE.Vector3(0.835, 0, -0.55)   // 本体 +Z（1 点）指向：右前方（偏离相机轴 33°）
  );
  die.quaternion.setFromRotationMatrix(basis);
  die.position.y = 0.16;
  scene.add(die);

  if (style.edge) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.92, 1.92, 1.92), 30),
      new THREE.LineBasicMaterial({ color: style.edge, transparent: true, opacity: 0.55 })
    );
    edges.quaternion.copy(die.quaternion);
    edges.position.copy(die.position);
    scene.add(edges);
  }

  // 预烘焙的假阴影：一张贴在地面的椭圆，省掉实时阴影的全部开销。
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 40),
    new THREE.MeshBasicMaterial({ color: 0x8b8172, transparent: true, opacity: 0.17, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -0.93;
  shadow.scale.set(1, 0.62, 1);
  scene.add(shadow);

  renderer.render(scene, camera);
  new ResizeObserver(resize).observe(stage);
  resize();

  return { renderer, scene, camera, die, geometry, materials, resize };
}

const handles = [];
for (const card of document.querySelectorAll(".card[data-style]")) {
  const styleName = card.dataset.style;
  if (styleName === "fallback") continue;
  const stage = card.querySelector(".stage");
  handles.push({ ...buildDie(styleName, stage), stage });
}

/** 静止时完全不渲染；原型里只是让观感不死板，正式实现里静止即停。 */
let visible = true;
document.addEventListener("visibilitychange", () => { visible = !document.hidden; });

function tick() {
  if (visible) for (const h of handles) h.renderer.render(h.scene, h.camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

window.__dicePrototypeReady = true;
