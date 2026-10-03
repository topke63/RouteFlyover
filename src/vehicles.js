// Low-poly 3D rider markers (car, adventure motorcycle, two motorcycles, bicycle), built from
// simple shapes so there are no model files to license. Each frame the chosen vehicle is
// rendered from the angle the map camera sees it at (map tilt + heading relative to the map),
// and the picture is placed on the overlay at the rider's position.
import * as THREE from 'three';

const ACCENT = 0xff5a1f;
const ACCENT_2 = 0xff3d6e;
const NAVY = 0x0d1524;
const TIRE = 0x1b1d22;
const ALU = 0xc4cad3;
const GLASS = 0x2a3442;

// Models are built in metres: Y up, front towards −Z, origin on the ground at the middle.
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, flatShading: true, ...extra });

function box(group, [w, h, d], color, [x, y, z], rot = [0, 0, 0], extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? mat(color, extra) : color);
  m.position.set(x, y, z);
  m.rotation.set(...rot);
  group.add(m);
  return m;
}

function wheel(group, r, width, [x, y, z], color = TIRE) {
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 18), mat(color));
  tire.rotation.z = Math.PI / 2;
  tire.position.set(x, y, z);
  group.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, width + 0.02, 12), mat(ALU, { metalness: 0.4 }));
  hub.rotation.z = Math.PI / 2;
  hub.position.set(x, y, z);
  group.add(hub);
}

function rod(group, from, to, r, color) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), mat(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  group.add(m);
  return m;
}

// A rider leaning slightly forward, hands reaching to the bars at handZ.
function rider(group, seatY, seatZ, handY, handZ, helmet = ACCENT) {
  box(group, [0.42, 0.62, 0.3], NAVY, [0, seatY + 0.36, seatZ], [-0.25, 0, 0]);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), mat(helmet));
  head.position.set(0, seatY + 0.82, seatZ - 0.12);
  group.add(head);
  for (const side of [-1, 1]) {
    rod(group, [side * 0.2, seatY + 0.6, seatZ - 0.05], [side * 0.3, handY, handZ], 0.055, NAVY);
    rod(group, [side * 0.14, seatY + 0.05, seatZ + 0.05], [side * 0.18, seatY - 0.25, seatZ - 0.3], 0.07, NAVY);
    rod(group, [side * 0.18, seatY - 0.25, seatZ - 0.3], [side * 0.2, seatY - 0.55, seatZ - 0.15], 0.06, NAVY);
  }
}

function car() {
  const g = new THREE.Group();
  const paint = mat(ACCENT);
  box(g, [1.8, 0.62, 4.1], paint, [0, 0.62, 0]);                       // body
  box(g, [1.82, 0.22, 4.15], mat(0xd8401a), [0, 0.4, 0]);             // sill line
  box(g, [1.6, 0.58, 2.2], mat(GLASS, { roughness: 0.2 }), [0, 1.2, 0.25]); // glasshouse
  box(g, [1.66, 0.12, 2.25], paint, [0, 1.53, 0.25]);                  // roof
  box(g, [0.14, 0.58, 0.18], paint, [0.74, 1.2, -0.8]);               // A-pillars
  box(g, [0.14, 0.58, 0.18], paint, [-0.74, 1.2, -0.8]);
  box(g, [1.82, 0.16, 0.1], mat(0xfff3c4, { emissive: 0x665522 }), [0, 0.74, -2.06]); // headlights
  box(g, [1.82, 0.16, 0.1], mat(0x8a0f12), [0, 0.76, 2.06]);         // tail lights
  box(g, [1.84, 0.14, 0.12], mat(TIRE), [0, 0.38, -2.08]);            // bumpers
  box(g, [1.84, 0.14, 0.12], mat(TIRE), [0, 0.38, 2.08]);
  for (const [x, z] of [[0.86, -1.3], [-0.86, -1.3], [0.86, 1.35], [-0.86, 1.35]]) wheel(g, 0.38, 0.32, [x, 0.38, z]);
  // Luggage strapped to a roof rack.
  box(g, [1.3, 0.06, 1.5], mat(TIRE), [0, 1.62, 0.25]);
  box(g, [0.95, 0.42, 0.75], mat(0x6d3cc4), [0, 1.86, 0.05]);
  box(g, [0.6, 0.3, 0.5], mat(0xf2b134), [0.05, 1.8, 0.75]);
  box(g, [0.97, 0.05, 0.08], mat(TIRE), [0, 2.08, 0.05]);
  return g;
}

// Adventure tourer in the style of a BMW R 1200 GS Adventure: tall screen, "beak" fender,
// boxer cylinders sticking out both sides, aluminium panniers and top case, 19" front wheel.
function gsBike(colors = { tank: 0xf2f2f2, accent: 0x1f5fbf, helmet: ACCENT }) {
  const g = new THREE.Group();
  wheel(g, 0.46, 0.13, [0, 0.46, -0.78]);                              // 19" front
  wheel(g, 0.41, 0.17, [0, 0.41, 0.78]);                               // 17" rear
  rod(g, [0, 0.46, -0.78], [0, 1.05, -0.5], 0.045, ALU);             // telelever fork
  rod(g, [0, 0.41, 0.78], [0, 0.55, 0.15], 0.06, 0x30343c);          // paralever swingarm
  box(g, [0.36, 0.08, 0.5], mat(colors.accent), [0, 0.86, -0.9], [0.35, 0, 0]); // beak
  box(g, [0.5, 0.36, 0.62], mat(colors.tank), [0, 1.02, -0.22]);    // tank
  box(g, [0.52, 0.1, 0.5], mat(colors.accent), [0, 1.0, -0.22]);    // tank stripe
  box(g, [0.36, 0.3, 0.2], mat(colors.tank), [0, 1.08, -0.62], [-0.3, 0, 0]);  // headlight fairing
  box(g, [0.42, 0.42, 0.04], mat(0x9fc7e8, { transparent: true, opacity: 0.55, roughness: 0.1 }), [0, 1.43, -0.68], [-0.45, 0, 0]); // screen
  rod(g, [-0.42, 1.2, -0.48], [0.42, 1.2, -0.48], 0.025, TIRE);     // wide handlebar
  box(g, [0.34, 0.32, 0.5], mat(0x3a3f48), [0, 0.6, -0.15]);         // engine block
  rod(g, [-0.52, 0.56, -0.32], [0.52, 0.56, -0.32], 0.11, ALU);      // boxer cylinders
  for (const side of [-1, 1]) {
    box(g, [0.12, 0.2, 0.24], mat(0x3a3f48), [side * 0.55, 0.56, -0.32]); // cylinder heads
    box(g, [0.24, 0.42, 0.55], mat(ALU, { metalness: 0.35 }), [side * 0.38, 0.78, 0.6]); // panniers
  }
  box(g, [0.32, 0.12, 0.72], mat(TIRE), [0, 1.03, 0.3]);             // seat
  box(g, [0.42, 0.32, 0.42], mat(ALU, { metalness: 0.35 }), [0, 1.22, 0.85]); // top case
  rider(g, 1.08, 0.18, 1.2, -0.48, colors.helmet);
  return g;
}

function bikePair() {
  const g = new THREE.Group();
  g.add(gsBike());
  const second = gsBike({ tank: 0x2b2f36, accent: 0xf2b134, helmet: 0xf2f2f2 });
  second.position.set(0.95, 0, 2.3);
  g.add(second);
  return g;
}

function bicycle() {
  const g = new THREE.Group();
  for (const z of [-0.55, 0.55]) {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 28), mat(TIRE));
    tire.rotation.y = Math.PI / 2;
    tire.position.set(0, 0.36, z);
    g.add(tire);
  }
  const frame = ACCENT;
  rod(g, [0, 0.36, 0.55], [0, 0.4, 0], 0.03, frame);                  // chainstay
  rod(g, [0, 0.4, 0], [0, 0.85, 0.12], 0.035, frame);                 // seat tube
  rod(g, [0, 0.85, 0.12], [0, 0.82, -0.42], 0.035, frame);            // top tube
  rod(g, [0, 0.4, 0], [0, 0.82, -0.42], 0.04, frame);                 // down tube
  rod(g, [0, 0.36, 0.55], [0, 0.85, 0.12], 0.025, frame);             // seat stay
  rod(g, [0, 0.36, -0.55], [0, 0.95, -0.45], 0.03, ALU);              // fork
  rod(g, [-0.25, 0.98, -0.45], [0.25, 0.98, -0.45], 0.022, TIRE);     // handlebar
  box(g, [0.16, 0.05, 0.26], mat(TIRE), [0, 0.92, 0.14]);             // saddle
  rider(g, 0.92, 0.14, 0.98, -0.45, ACCENT_2);
  return g;
}

const BUILDERS = { car, 'moto-gs': () => gsBike(), 'moto-pair': bikePair, bicycle };

export class VehicleRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 8, 4);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    this.models = {};
    this.current = null;
  }

  // Render `kind` seen from a camera tilted `pitch` degrees from straight down, with the
  // vehicle heading `relHeading` degrees clockwise from the camera's view direction.
  // Returns a square canvas `size` px wide, the ground point at its centre.
  render(kind, relHeading, pitch, size) {
    if (!BUILDERS[kind]) return null;
    if (!this.models[kind]) {
      const model = BUILDERS[kind]();
      const sphere = new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere());
      this.models[kind] = { model, radius: sphere.radius, centerY: sphere.center.y };
    }
    const { model, radius, centerY } = this.models[kind];
    if (this.current !== model) {
      if (this.current) this.scene.remove(this.current);
      this.scene.add(model);
      this.current = model;
    }
    if (this.canvas.width !== size) this.renderer.setSize(size, size, false);
    model.rotation.y = (-relHeading * Math.PI) / 180;
    // Camera behind the scene's "north", raised to match the map tilt, aimed at the ground
    // point so that it lands at the canvas centre.
    const elev = ((90 - Math.min(85, Math.max(0, pitch))) * Math.PI) / 180;
    const dist = radius / Math.sin((this.camera.fov * Math.PI) / 360) * 1.25;
    this.camera.position.set(0, Math.sin(elev) * dist + centerY * 0.3, Math.cos(elev) * dist);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }
}
