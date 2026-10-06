/* Room Remix. All geometry, palettes, and room dimensions are invented. */
"use strict";
const $ = (id) => document.getElementById(id);
const canvas = $("room-canvas");
const ctx = canvas.getContext("2d");
const C = Math.sqrt(3) / 2;
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wallColors = [
  { name: "Linen", hex: "#e8dfcf" },
  { name: "Chalk", hex: "#f4f1e7" },
  { name: "Olive mist", hex: "#b7bca5" },
  { name: "Clay", hex: "#cf9e85" },
  { name: "Soft blue", hex: "#acbfc4" },
  { name: "Butter", hex: "#e5cc92" },
];
const floors = [
  { name: "Maple", hex: "#cdb18a" },
  { name: "Walnut", hex: "#917158" },
  { name: "White oak", hex: "#ded0b7" },
];
const finishes = [
  { name: "Oat", hex: "#c9c1a6" },
  { name: "Moss", hex: "#858f66" },
  { name: "Terracotta", hex: "#bd7656" },
  { name: "Ink blue", hex: "#637e8a" },
  { name: "Goldenrod", hex: "#c6a058" },
  { name: "Warm rose", hex: "#bc9293" },
];
const styles = {
  warm: {
    name: "Warm minimal",
    wall: 0,
    floor: 0,
    sofa: "#babca3",
    chair: "#c7a077",
    wood: "#97765a",
    rug: "#e2d6b9",
    accent: "#b76e4d",
    pot: "#bd8565",
    books: ["#bac4aa", "#d1b994", "#d7cabb"],
  },
  retro: {
    name: "Colorful retro",
    wall: 5,
    floor: 1,
    sofa: "#63898b",
    chair: "#c99348",
    wood: "#80634e",
    rug: "#c5825c",
    accent: "#dcad64",
    pot: "#617e8a",
    books: ["#c5765c", "#cda764", "#66898b"],
  },
  cozy: {
    name: "Cozy corner",
    wall: 2,
    floor: 2,
    sofa: "#c8987c",
    chair: "#7c8b67",
    wood: "#a08265",
    rug: "#d5c9ad",
    accent: "#879471",
    pot: "#bca18a",
    books: ["#9caa89", "#caa283", "#cfc0a0"],
  },
  original: {
    name: "Original",
    wall: 1,
    floor: 0,
    sofa: "#a9a49a",
    chair: "#9d9a8a",
    wood: "#967d66",
    rug: "#c4baa6",
    accent: "#9d8974",
    pot: "#b4a395",
    books: ["#b8b3a5", "#8f998e", "#b7a190"],
  },
};
const furniture = [
  { id: "sofa", name: "Arc sofa", glyph: "▰", w: 2.1, d: 0.88 },
  { id: "chair", name: "Loop chair", glyph: "▱", w: 0.8, d: 0.85 },
  { id: "table", name: "Pebble table", glyph: "◒", w: 1.15, d: 0.7 },
  { id: "shelf", name: "Open shelf", glyph: "▤", w: 1.25, d: 0.34 },
  { id: "plant", name: "Leafy friend", glyph: "♧", w: 0.58, d: 0.58 },
  { id: "lamp", name: "Orbit lamp", glyph: "◉", w: 0.48, d: 0.48 },
];
const rooms = {
  studio: {
    title: "The sunlit studio",
    number: "01",
    w: 5.6,
    d: 4.4,
    layout: [
      [1.7, 1.12, 0],
      [3.68, 2.83, 1],
      [2.55, 2.48, 0],
      [0.33, 2.62, 1],
      [4.88, 0.65, 0],
      [3.26, 0.68, 0],
    ],
    before: [
      [3.34, 1.45, 1],
      [1.14, 3.18, 0],
      [3.25, 3.17, 1],
      [2.8, 0.42, 0],
      [0.68, 2.06, 0],
      [4.54, 3.58, 0],
    ],
    rug: { x: 2.48, y: 2.35, w: 2.5, d: 2.05 },
  },
  "tiny-bedroom": {
    title: "The tiny bedroom",
    number: "02",
    w: 4.2,
    d: 3.7,
    layout: [
      [1.28, 1.38, 0],
      [3.31, 2.78, 1],
      [2.61, 2.08, 0],
      [0.32, 2.83, 1],
      [3.62, 0.61, 0],
      [2.64, 0.55, 0],
    ],
    before: [
      [2.6, 1.45, 0],
      [0.78, 0.77, 0],
      [1.2, 2.8, 1],
      [0.32, 2.12, 1],
      [3.63, 3.1, 0],
      [3.56, 0.39, 0],
    ],
    rug: { x: 2.34, y: 2.23, w: 2.3, d: 1.7 },
  },
};
let roomId = new URLSearchParams(location.search).get("room");
if (!rooms[roomId]) roomId = "studio";
let state,
  original,
  selected = null,
  comparing = false;
let scale = 60,
  origin = { x: 0, y: 0 },
  size = { w: 0, h: 0 };
let faces = [],
  hitAreas = [],
  dragging = null,
  frame = null;

function pieceInfo(id) {
  const info = furniture.find((piece) => piece.id === id);
  return roomId === "tiny-bedroom" && id === "sofa"
    ? { ...info, name: "Cloud bed", w: 1.5, d: 2.05 }
    : info;
}

function shade(color, amount) {
  const n = parseInt(color.slice(1), 16);
  const channel = (shift) =>
    Math.round(clamp(((n >> shift) & 255) * amount, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return "#" + channel(16) + channel(8) + channel(0);
}
function point(x, y, z = 0) {
  return {
    x: origin.x + (x - y) * C * scale,
    y: origin.y + (x + y) * 0.5 * scale - z * scale,
  };
}
function world(p) {
  const a = (p.x - origin.x) / (C * scale),
    b = (p.y - origin.y) / (0.5 * scale);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
function polygon(points, fill, stroke = null, width = 1) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}
function path(points, stroke, width = 1) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}
function local(item, x, y, z) {
  const a = (item.rotation * Math.PI) / 2,
    co = Math.cos(a),
    si = Math.sin(a);
  return { x: item.x + x * co - y * si, y: item.y + x * si + y * co, z };
}
function addFace(points, color, id, stroke = "#4c423318") {
  faces.push({
    points,
    color,
    id,
    stroke,
    depth: points.reduce((s, p) => s + p.x + p.y + p.z, 0) / points.length,
  });
}
function box(item, x, y, z, w, d, h, color) {
  const corners = [
    [x - w / 2, y - d / 2],
    [x + w / 2, y - d / 2],
    [x + w / 2, y + d / 2],
    [x - w / 2, y + d / 2],
  ];
  const low = corners.map(([a, b]) => local(item, a, b, z)),
    high = corners.map(([a, b]) => local(item, a, b, z + h));
  addFace(high, shade(color, 1.07), item.id);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4,
      dx = high[j].x - high[i].x,
      dy = high[j].y - high[i].y;
    if (dy - dx > 0.0001)
      addFace(
        [low[i], low[j], high[j], high[i]],
        shade(color, dy > 0 ? 0.9 : 0.76),
        item.id,
      );
  }
}
function cylinder(item, x, y, z, rx, ry, h, color, sides = 24) {
  const low = [],
    high = [];
  for (let i = 0; i < sides; i++) {
    const a = (i * Math.PI * 2) / sides;
    low.push(local(item, x + Math.cos(a) * rx, y + Math.sin(a) * ry, z));
    high.push(local(item, x + Math.cos(a) * rx, y + Math.sin(a) * ry, z + h));
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides,
      dx = high[j].x - high[i].x,
      dy = high[j].y - high[i].y;
    if (dy - dx > 0)
      addFace(
        [low[i], low[j], high[j], high[i]],
        shade(color, 0.82 + (dy / Math.max(0.001, Math.hypot(dx, dy))) * 0.08),
        item.id,
        null,
      );
  }
  addFace(high, shade(color, 1.08), item.id, null);
}
function buildFurniture(item, design) {
  const p = styles[design.style],
    color = item.color;
  if (item.id === "sofa" && roomId === "tiny-bedroom") {
    for (const x of [-0.62, 0.62])
      for (const y of [-0.85, 0.85])
        box(item, x, y, 0.03, 0.075, 0.075, 0.18, p.wood);
    box(item, 0, 0, 0.18, 1.5, 2.05, 0.12, p.wood);
    box(item, 0, -0.95, 0.29, 1.5, 0.13, 0.65, color);
    box(item, 0, 0.005, 0.3, 1.44, 1.97, 0.21, "#eee7d6");
    box(item, 0, 0.26, 0.515, 1.45, 1.43, 0.075, color);
    box(item, 0, 0.68, 0.594, 1.46, 0.4, 0.022, p.accent);
    for (const x of [-0.36, 0.36])
      box(item, x, -0.63, 0.515, 0.59, 0.38, 0.13, "#e9deca");
    box(item, -0.38, -0.08, 0.591, 0.4, 0.3, 0.075, p.accent);
  } else if (item.id === "sofa" || item.id === "chair") {
    const isChair = item.id === "chair",
      w = isChair ? 0.8 : 2.1,
      seatW = w - 0.22;
    for (const x of [-w / 2 + 0.12, w / 2 - 0.12])
      for (const y of [-0.29, 0.29])
        box(item, x, y, 0.03, 0.065, 0.065, 0.22, p.wood);
    box(item, 0, 0, 0.2, w, 0.8, 0.25, color);
    box(item, 0, -0.33, 0.43, w, 0.17, 0.43, shade(color, 0.95));
    for (const x of [-w / 2 + 0.07, w / 2 - 0.07])
      box(item, x, 0.025, 0.42, 0.14, 0.74, 0.29, color);
    const count = isChair ? 1 : 3;
    for (let i = 0; i < count; i++) {
      const x = -seatW / 2 + ((i + 0.5) * seatW) / count;
      box(
        item,
        x,
        0.045,
        0.45,
        seatW / count - 0.025,
        0.54,
        0.135,
        shade(color, 1.08),
      );
      box(
        item,
        x,
        -0.22,
        0.59,
        seatW / count - 0.045,
        0.115,
        0.225,
        shade(color, 1.025),
      );
    }
    box(
      item,
      isChair ? 0.02 : -0.67,
      -0.08,
      0.6,
      isChair ? 0.28 : 0.31,
      0.13,
      0.23,
      p.accent,
    );
    if (!isChair) box(item, 0.66, -0.08, 0.6, 0.3, 0.13, 0.22, "#ded0b1");
  } else if (item.id === "table") {
    for (const x of [-0.32, 0.32])
      for (const y of [-0.18, 0.18])
        box(item, x, y, 0.015, 0.06, 0.06, 0.37, p.wood);
    cylinder(item, 0, 0, 0.37, 0.57, 0.34, 0.09, color);
    cylinder(item, 0.22, 0.06, 0.465, 0.09, 0.075, 0.018, p.accent);
    cylinder(item, 0.22, 0.06, 0.484, 0.028, 0.026, 0.06, "#eee4d4", 16);
    box(item, -0.18, -0.065, 0.46, 0.23, 0.15, 0.035, "#8d9c84");
    box(item, -0.17, -0.055, 0.496, 0.19, 0.145, 0.023, "#e4dac4");
  } else if (item.id === "shelf") {
    box(item, -0.59, 0, 0.04, 0.06, 0.33, 1.5, color);
    box(item, 0.59, 0, 0.04, 0.06, 0.33, 1.5, color);
    for (const z of [0.12, 0.56, 1.02, 1.48])
      box(item, 0, 0, z, 1.25, 0.35, 0.065, color);
    for (let level = 0; level < 3; level++)
      for (let i = 0; i < 5; i++) {
        const x = -0.44 + i * 0.13,
          height = 0.2 + ((i + level) % 3) * 0.045;
        box(
          item,
          x,
          0.025,
          0.185 + level * 0.46,
          0.085,
          0.2,
          height,
          p.books[(i + level) % 3],
        );
      }
    cylinder(item, 0.35, 0, 1.55, 0.085, 0.08, 0.17, p.pot, 16);
  } else if (item.id === "plant") {
    cylinder(item, 0, 0, 0.02, 0.18, 0.18, 0.045, shade(p.pot, 0.8));
    cylinder(item, 0, 0, 0.065, 0.205, 0.205, 0.32, color);
    cylinder(item, 0, 0, 0.385, 0.215, 0.215, 0.045, shade(color, 0.95));
    cylinder(item, 0, 0, 0.431, 0.177, 0.177, 0.004, "#62583d");
    box(item, 0, 0, 0.43, 0.018, 0.018, 0.6, "#5c7952");
    const leaves = [
      [-0.17, 0.04, 0.78, 0.18],
      [0.19, -0.04, 0.93, 0.16],
      [-0.1, -0.08, 1.1, 0.19],
      [0.12, 0.14, 0.69, 0.17],
      [-0.18, -0.08, 0.58, 0.15],
      [0.03, 0.04, 1.25, 0.12],
    ];
    leaves.forEach(([x, y, z, r], i) => {
      const stemStart = local(item, 0, 0, z - 0.18),
        stemEnd = local(item, x, y, z);
      faces.push({
        type: "stem",
        points: [stemStart, stemEnd],
        color: "#547444",
        id: item.id,
        depth: stemEnd.x + stemEnd.y + stemEnd.z,
      });
      faces.push({
        type: "leaf",
        center: stemEnd,
        r,
        color: i % 2 ? "#7c965f" : "#65844e",
        id: item.id,
        depth: stemEnd.x + stemEnd.y + stemEnd.z + 0.03,
        tilt: i % 2 ? 0.5 : -0.55,
      });
    });
  } else if (item.id === "lamp") {
    cylinder(item, 0, 0, 0.01, 0.18, 0.18, 0.05, p.wood);
    cylinder(item, 0, 0, 0.06, 0.022, 0.022, 1.27, "#bfa374", 12);
    cylinder(item, 0, 0, 1.3, 0.235, 0.235, 0.17, color);
    cylinder(item, 0, 0, 1.475, 0.17, 0.17, 0.04, shade(color, 1.04));
  }
}
function floorAndWalls(design, room) {
  const wall = wallColors[design.wall].hex,
    floor = floors[design.floor].hex;
  // Subtle floor shadow, then the cutaway slab.
  const center = point(room.w / 2, room.d / 2, -0.2);
  ctx.save();
  ctx.translate(center.x, center.y + 18);
  ctx.scale(1, 0.35);
  const glow = ctx.createRadialGradient(0, 0, 20, 0, 0, scale * 3.1);
  glow.addColorStop(0, "#5d68472a");
  glow.addColorStop(1, "#5d684700");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, scale * 3.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const a = point(0, 0),
    b = point(room.w, 0),
    c = point(room.w, room.d),
    d = point(0, room.d);
  polygon(
    [b, c, point(room.w, room.d, -0.15), point(room.w, 0, -0.15)],
    shade(floor, 0.72),
  );
  polygon(
    [d, c, point(room.w, room.d, -0.15), point(0, room.d, -0.15)],
    shade(floor, 0.86),
  );
  polygon([a, b, c, d], floor);
  // Deterministic plank seams and grain; no textures or downloaded assets.
  ctx.save();
  polygon([a, b, c, d]);
  ctx.clip();
  for (let y = 0, row = 0; y < room.d; y += 0.31, row++) {
    path([point(0, y), point(room.w, y)], shade(floor, 0.9), 0.65);
    for (let x = (row % 3) * 0.58; x < room.w; x += 1.7)
      path(
        [point(x, y), point(x, Math.min(y + 0.31, room.d))],
        shade(floor, 0.9),
        0.55,
      );
    for (let x = 0.2; x < room.w; x += 0.63)
      path(
        [point(x, y + 0.11), point(Math.min(room.w, x + 0.32), y + 0.12)],
        shade(floor, 1.035),
        0.8,
      );
  }
  // Afternoon light falls on the floor from the broad rear window.
  polygon(
    [point(1.35, 0.12), point(3.76, 0.12), point(4.8, 2.03), point(2.2, 2.03)],
    "#fff8d92c",
  );
  path([point(2.17, 0.12), point(3.19, 2.03)], "#c7b58428", 4);
  path([point(2.98, 0.12), point(4.03, 2.03)], "#c7b58428", 4);
  ctx.restore();
  // Two open-backed walls, their upper edges and baseboards.
  polygon([a, b, point(room.w, 0, 2.5), point(0, 0, 2.5)], shade(wall, 1.01));
  polygon([a, d, point(0, room.d, 2.5), point(0, 0, 2.5)], shade(wall, 0.89));
  path(
    [point(0, room.d, 2.5), point(0, 0, 2.5), point(room.w, 0, 2.5)],
    "#f6f1e5",
    3,
  );
  path(
    [point(0, room.d, 0.1), point(0, 0, 0.1), point(room.w, 0, 0.1)],
    shade(wall, 1.09),
    6,
  );
  path([point(0, 0, 0.1), point(0, 0, 2.5)], shade(wall, 0.85), 1);
  // Window frame and sky, drawn as geometry on the wall plane.
  const left = room.w * 0.27,
    right = room.w * 0.76,
    low = 0.88,
    high = 2.19;
  polygon(
    [
      point(left, 0, low),
      point(right, 0, low),
      point(right, 0, high),
      point(left, 0, high),
    ],
    "#b7cfd0",
    "#eee9df",
    6,
  );
  polygon(
    [
      point(left, 0, low),
      point(right, 0, low),
      point(right, 0, 1.38),
      point(left, 0, 1.52),
    ],
    "#e1e7d5",
  );
  const mid = (left + right) / 2;
  path([point(mid, 0, low), point(mid, 0, high)], "#f4ede2", 4);
  path([point(left, 0, 1.51), point(right, 0, 1.51)], "#f4ede2", 3);
  path(
    [point(left - 0.08, -0.015, low), point(right + 0.08, -0.015, low)],
    "#e5d8bd",
    7,
  );
  // A small abstract print on the left wall.
  polygon(
    [
      point(0, 1.13, 1.12),
      point(0, 1.95, 1.12),
      point(0, 1.95, 2.04),
      point(0, 1.13, 2.04),
    ],
    "#a17f60",
  );
  polygon(
    [
      point(0.009, 1.19, 1.18),
      point(0.009, 1.89, 1.18),
      point(0.009, 1.89, 1.98),
      point(0.009, 1.19, 1.98),
    ],
    "#f1e6d0",
  );
  polygon(
    [
      point(0.02, 1.3, 1.28),
      point(0.02, 1.79, 1.28),
      point(0.02, 1.79, 1.66),
      point(0.02, 1.53, 1.83),
      point(0.02, 1.3, 1.66),
    ],
    styles[design.style].accent,
  );
}
function drawRug(design, room) {
  const p = styles[design.style],
    r = room.rug,
    x = r.x - r.w / 2,
    y = r.y - r.d / 2;
  const corners = [
    point(x, y, 0.012),
    point(x + r.w, y, 0.012),
    point(x + r.w, y + r.d, 0.012),
    point(x, y + r.d, 0.012),
  ];
  polygon(corners, p.rug, shade(p.rug, 0.88), 1);
  const margin = 0.1;
  ctx.setLineDash([3, 3]);
  polygon(
    [
      point(x + margin, y + margin, 0.014),
      point(x + r.w - margin, y + margin, 0.014),
      point(x + r.w - margin, y + r.d - margin, 0.014),
      point(x + margin, y + r.d - margin, 0.014),
    ],
    null,
    shade(p.rug, 0.82),
    1,
  );
  ctx.setLineDash([]);
  for (let t = 0; t < r.w; t += 0.065) {
    path(
      [point(x + t, y, 0.015), point(x + t, y - 0.045, 0.015)],
      shade(p.rug, 0.88),
      0.8,
    );
    path(
      [point(x + t, y + r.d, 0.015), point(x + t, y + r.d + 0.045, 0.015)],
      shade(p.rug, 0.88),
      0.8,
    );
  }
  if (design.style === "retro")
    for (let n = 0; n < 4; n++) {
      const a = 0.28 + n * 0.27;
      path(
        [
          point(x + a, y + 0.24, 0.018),
          point(x + a + 0.52, y + r.d - 0.24, 0.018),
        ],
        "#e6bc8080",
        scale * 0.06,
      );
    }
}
function footprint(item, z = 0.025) {
  const info = pieceInfo(item.id);
  return [
    [-info.w / 2, -info.d / 2],
    [info.w / 2, -info.d / 2],
    [info.w / 2, info.d / 2],
    [-info.w / 2, info.d / 2],
  ].map(([x, y]) => {
    const p = local(item, x, y, z);
    return point(p.x, p.y, p.z);
  });
}
function render() {
  frame = null;
  const rect = canvas.getBoundingClientRect(),
    pixelRatio = window.devicePixelRatio || 1;
  if (rect.width <= 0 || rect.height <= 0) return;
  size = { w: rect.width, h: rect.height };
  if (
    canvas.width !== Math.round(size.w * pixelRatio) ||
    canvas.height !== Math.round(size.h * pixelRatio)
  ) {
    canvas.width = Math.round(size.w * pixelRatio);
    canvas.height = Math.round(size.h * pixelRatio);
  }
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);
  const room = rooms[roomId],
    design = comparing ? original : state;
  scale = Math.min(
    (size.w - 40) / ((room.w + room.d) * C),
    (size.h - 100) / ((room.w + room.d) * 0.5 + 2.5),
  );
  origin = {
    x: (size.w - (room.w - room.d) * C * scale) / 2,
    y: (size.h - (room.w + room.d) * 0.5 * scale + 2.5 * scale) / 2 - 5,
  };
  floorAndWalls(design, room);
  drawRug(design, room);
  // Soft, unobtrusive contact shadows under each piece.
  for (const item of design.items) {
    ctx.save();
    ctx.filter = "blur(5px)";
    polygon(footprint(item, 0.02), "#443d3422");
    ctx.restore();
  }
  if (selected && !comparing) {
    const item = state.items.find((i) => i.id === selected);
    ctx.setLineDash([5, 4]);
    polygon(footprint(item, 0.03), "#87967119", "#71845c", 1.5);
    ctx.setLineDash([]);
  }
  faces = [];
  hitAreas = [];
  design.items.forEach((item) => buildFurniture(item, design));
  faces.sort((a, b) => {
    // A smaller shape resting on a larger one must stay above its surface,
    // even when rotation moves the shapes' centers along the viewing axis.
    if (a.id === b.id && !a.type && !b.type) {
      const aMin = Math.min(...a.points.map((p) => p.z));
      const aMax = Math.max(...a.points.map((p) => p.z));
      const bMin = Math.min(...b.points.map((p) => p.z));
      const bMax = Math.max(...b.points.map((p) => p.z));
      if (aMax < bMin - 0.001) return -1;
      if (bMax < aMin - 0.001) return 1;
    }
    return a.depth - b.depth;
  });
  for (const face of faces) {
    if (face.type === "stem") {
      path(
        face.points.map((p) => point(p.x, p.y, p.z)),
        face.color,
        Math.max(1, scale * 0.016),
      );
      continue;
    }
    if (face.type === "leaf") {
      const p = point(face.center.x, face.center.y, face.center.z),
        rx = face.r * scale,
        ry = rx * 0.43;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(face.tilt);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = face.color;
      ctx.fill();
      path(
        [
          { x: -rx * 0.8, y: 0 },
          { x: rx * 0.8, y: 0 },
        ],
        "#abc38b88",
        0.75,
      );
      ctx.restore();
      const points = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2,
          x = Math.cos(a) * rx,
          y = Math.sin(a) * ry;
        points.push({
          x: p.x + x * Math.cos(face.tilt) - y * Math.sin(face.tilt),
          y: p.y + x * Math.sin(face.tilt) + y * Math.cos(face.tilt),
        });
      }
      hitAreas.push({ points, id: face.id });
    } else {
      const points = face.points.map((p) => point(p.x, p.y, p.z));
      polygon(points, face.color, face.stroke, 0.65);
      hitAreas.push({ points, id: face.id });
    }
  }
}
function requestRender() {
  if (!frame) frame = requestAnimationFrame(render);
}
function contains(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function hit(p) {
  for (let i = hitAreas.length - 1; i >= 0; i--)
    if (contains(p, hitAreas[i].points)) return hitAreas[i].id;
  return null;
}
function pointer(event) {
  const r = canvas.getBoundingClientRect();
  return { x: event.clientX - r.left, y: event.clientY - r.top };
}
function announce(text) {
  $("announcement").textContent = text;
}
function constrain(item) {
  const room = rooms[roomId],
    info = pieceInfo(item.id),
    odd = item.rotation % 2,
    w = odd ? info.d : info.w,
    d = odd ? info.w : info.d;
  item.x = clamp(item.x, w / 2 + 0.07, room.w - w / 2 - 0.07);
  item.y = clamp(item.y, d / 2 + 0.07, room.d - d / 2 - 0.07);
}
function applyStyle(key) {
  if (comparing) return;
  state.style = key;
  state.wall = styles[key].wall;
  state.floor = styles[key].floor;
  state.items.forEach((i) => {
    i.color =
      styles[key][i.id] ||
      {
        table: styles[key].wood,
        shelf: styles[key].wood,
        plant: styles[key].pot,
        lamp: "#e9dcc0",
      }[i.id];
  });
  sync();
  announce(styles[key].name + " style applied.");
}
function setSelected(id, focus = false) {
  selected = id;
  sync();
  if (id)
    announce(
      pieceInfo(id).name + " selected. Use arrow keys to move, or R to rotate.",
    );
  if (focus) canvas.focus({ preventScroll: true });
}
function rotateSelected() {
  if (!selected || comparing) return;
  const item = state.items.find((i) => i.id === selected);
  item.rotation = (item.rotation + 1) % 4;
  constrain(item);
  sync();
  announce(
    pieceInfo(selected).name + " rotated " + item.rotation * 90 + " degrees.",
  );
}
function setCompare(before) {
  dragging = null;
  canvas.classList.remove("dragging");
  comparing = before;
  sync();
  announce(
    before
      ? "Showing the original room. Choose After to continue designing."
      : "Showing your design.",
  );
}
function resetRoom(id) {
  roomId = id;
  selected = null;
  comparing = false;
  const room = rooms[id];
  state = {
    style: "warm",
    wall: 0,
    floor: 0,
    items: room.layout.map(([x, y, rotation], i) => ({
      id: furniture[i].id,
      x,
      y,
      rotation,
      color: "#aaaaaa",
    })),
  };
  original = {
    style: "original",
    wall: 1,
    floor: 0,
    items: room.before.map(([x, y, rotation], i) => ({
      id: furniture[i].id,
      x,
      y,
      rotation,
      color:
        styles.original[furniture[i].id] ||
        {
          table: styles.original.wood,
          shelf: styles.original.wood,
          plant: styles.original.pot,
          lamp: "#dbd3bd",
        }[furniture[i].id],
    })),
  };
  applyStyle("warm");
  sync();
}
function swatch(container, color, label, active, action) {
  const button = document.createElement("button");
  button.className = "swatch";
  button.dataset.controlKey = container.id + ":" + label;
  button.style.backgroundColor = color;
  button.style.setProperty(
    "--check-color",
    parseInt(color.slice(1, 3), 16) < 145 ? "#ffffff" : "#30392f",
  );
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(active));
  button.title = label;
  button.disabled = comparing;
  button.onclick = action;
  container.append(button);
}
function sync() {
  const focusKey = document.activeElement?.dataset?.controlKey;
  const visible = comparing ? original : state,
    room = rooms[roomId];
  $("room-title").textContent = room.title;
  $("room-number").textContent = room.number;
  $("room-size").textContent =
    room.w.toFixed(1) + " × " + room.d.toFixed(1) + " m";
  $("room-select").value = roomId;
  $("before").setAttribute("aria-pressed", String(comparing));
  $("after").setAttribute("aria-pressed", String(!comparing));
  $("view-label").textContent = comparing ? "THE ORIGINAL" : "YOUR REMIX";
  document.querySelector(".workspace").classList.toggle("is-before", comparing);
  $("canvas-help").lastChild.textContent = comparing
    ? " Original layout. Choose After to keep designing."
    : " Drag to rearrange. Select a piece to rotate.";
  $("style-options").replaceChildren();
  for (const key of ["warm", "retro", "cozy"]) {
    const s = styles[key],
      button = document.createElement("button");
    button.className = "style-button";
    button.dataset.controlKey = "style:" + key;
    button.setAttribute(
      "aria-pressed",
      String(!comparing && state.style === key),
    );
    button.disabled = comparing;
    button.innerHTML =
      '<span class="style-name">' +
      s.name +
      '</span><span class="palette-mini" aria-hidden="true">' +
      [wallColors[s.wall].hex, s.sofa, s.chair, s.accent]
        .map((c) => '<i style="background:' + c + '"></i>')
        .join("") +
      "</span>";
    button.onclick = () => applyStyle(key);
    $("style-options").append(button);
  }
  $("wall-name").textContent = wallColors[visible.wall].name;
  $("wall-options").replaceChildren();
  wallColors.forEach((color, i) =>
    swatch($("wall-options"), color.hex, color.name, visible.wall === i, () => {
      state.wall = i;
      sync();
      announce(color.name + " walls.");
    }),
  );
  $("floor-options").replaceChildren();
  floors.forEach((floor, i) => {
    const button = document.createElement("button");
    button.className = "floor-option";
    button.dataset.controlKey = "floor:" + i;
    button.setAttribute("aria-pressed", String(visible.floor === i));
    button.disabled = comparing;
    button.innerHTML =
      '<div class="wood-sample" style="--wood:' +
      floor.hex +
      '" aria-hidden="true"></div>' +
      floor.name;
    button.onclick = () => {
      state.floor = i;
      sync();
      announce(floor.name + " flooring.");
    };
    $("floor-options").append(button);
  });
  $("furniture-list").replaceChildren();
  furniture.forEach((piece) => {
    const info = pieceInfo(piece.id),
      button = document.createElement("button");
    button.className = "furniture-button";
    button.dataset.controlKey = "piece:" + info.id;
    button.setAttribute(
      "aria-pressed",
      String(selected === info.id && !comparing),
    );
    button.disabled = comparing;
    button.innerHTML =
      '<span class="furniture-glyph" aria-hidden="true">' +
      info.glyph +
      "</span>" +
      info.name;
    button.onclick = () => setSelected(info.id, true);
    $("furniture-list").append(button);
  });
  const info = pieceInfo(selected),
    item = state.items.find((i) => i.id === selected),
    canEdit = info && !comparing;
  $("selected-name").textContent = canEdit ? info.name : "Pick a piece";
  $("rotate").disabled = !canEdit;
  $("finish-controls").hidden = !canEdit;
  $("selection-hint").hidden = !!canEdit;
  if (canEdit) {
    $("finish-label").textContent = ["sofa", "chair"].includes(info.id)
      ? "Fabric"
      : "Finish";
    $("finish-options").replaceChildren();
    finishes.forEach((color) =>
      swatch(
        $("finish-options"),
        color.hex,
        color.name,
        item.color === color.hex,
        () => {
          item.color = color.hex;
          sync();
          announce(info.name + ": " + color.name + " finish.");
        },
      ),
    );
  }
  if (focusKey) {
    const button = [...document.querySelectorAll("[data-control-key]")].find(
      (b) => b.dataset.controlKey === focusKey,
    );
    if (button && !button.disabled) button.focus({ preventScroll: true });
  }
  requestRender();
}
canvas.addEventListener("pointerdown", (event) => {
  if (comparing || event.button !== 0) return;
  const p = pointer(event),
    id = hit(p);
  setSelected(id);
  canvas.focus({ preventScroll: true });
  if (!id) return;
  const item = state.items.find((i) => i.id === id),
    w = world(p);
  dragging = {
    id,
    dx: w.x - item.x,
    dy: w.y - item.y,
    pointerId: event.pointerId,
  };
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add("dragging");
});
canvas.addEventListener("pointermove", (event) => {
  if (!dragging) {
    canvas.style.cursor = comparing
      ? "default"
      : hit(pointer(event))
        ? "grab"
        : "default";
    return;
  }
  if (event.pointerId !== dragging.pointerId) return;
  const w = world(pointer(event)),
    item = state.items.find((i) => i.id === dragging.id);
  item.x = Math.round((w.x - dragging.dx) * 10) / 10;
  item.y = Math.round((w.y - dragging.dy) * 10) / 10;
  constrain(item);
  requestRender();
});
function stopDragging(event) {
  if (!dragging || event.pointerId !== dragging.pointerId) return;
  const id = dragging.id;
  dragging = null;
  canvas.classList.remove("dragging");
  if (canvas.hasPointerCapture(event.pointerId))
    canvas.releasePointerCapture(event.pointerId);
  announce(pieceInfo(id).name + " moved.");
}
canvas.addEventListener("pointerup", stopDragging);
canvas.addEventListener("pointercancel", stopDragging);
canvas.addEventListener("lostpointercapture", () => {
  dragging = null;
  canvas.classList.remove("dragging");
});
canvas.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSelected(null);
    return;
  }
  if (comparing || !selected) return;
  if (event.key.toLowerCase() === "r") {
    event.preventDefault();
    rotateSelected();
    return;
  }
  const vectors = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if (vectors[event.key]) {
    event.preventDefault();
    const item = state.items.find((i) => i.id === selected),
      step = event.shiftKey ? 0.5 : 0.1;
    item.x += vectors[event.key][0] * step;
    item.y += vectors[event.key][1] * step;
    constrain(item);
    requestRender();
    announce(pieceInfo(selected).name + " moved.");
  }
});
$("rotate").onclick = rotateSelected;
$("before").onclick = () => setCompare(true);
$("after").onclick = () => setCompare(false);
$("reset").onclick = () => {
  resetRoom(roomId);
  announce("Room reset to warm minimal.");
};
$("room-select").onchange = (event) => {
  resetRoom(event.target.value);
  const url = new URL(location.href);
  url.searchParams.set("room", roomId);
  history.replaceState(null, "", url);
  announce(rooms[roomId].title + " opened.");
};
new ResizeObserver(requestRender).observe(canvas);
resetRoom(roomId);

// Optional browser agent tools. Regular browsers need no additional runtime.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tools = [
    {
      name: "read_room_design",
      title: "Read room design",
      description:
        "Read the current fictional room, palette, furniture, and comparison view.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return {
          room: roomId,
          view: comparing ? "before" : "after",
          design: clone(comparing ? original : state),
        };
      },
    },
    {
      name: "set_room_style",
      title: "Set room style",
      description:
        "Apply a built-in style to the current room while preserving furniture positions. Requires the After view.",
      inputSchema: {
        type: "object",
        properties: {
          style: { type: "string", enum: ["warm", "retro", "cozy"] },
        },
        required: ["style"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        if (
          !input ||
          typeof input !== "object" ||
          Object.keys(input).length !== 1 ||
          !["warm", "retro", "cozy"].includes(input.style)
        )
          throw new Error("Choose warm, retro, or cozy.");
        if (comparing)
          throw new Error("Choose After before changing the design.");
        applyStyle(input.style);
        await new Promise(requestAnimationFrame);
        return { room: roomId, style: state.style };
      },
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        document.modelContext.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch (_) {
      // Experimental browser support never blocks the room playground.
    }
  }
  addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}
