import * as THREE from 'three';
import type { Chess, Color as Side, Move, PieceSymbol, Square } from 'chess.js';
import { animator, ease } from '../core/animator';
import { layout, squareCenter, worldToSquare } from '../core/layout';
import type { ChessAssets } from '../scene/assets';
import { Piece } from './Piece';

export const MarkerKind = {
  Move: 0,
  Capture: 1,
  Selected: 2,
  LastMove: 3,
  Check: 4,
  Hover: 5,
  Guide: 6,
} as const;
export type MarkerKind = (typeof MarkerKind)[keyof typeof MarkerKind];

const MARKER_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const MARKER_FRAG = /* glsl */ `
uniform int uKind;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float d = length(p) * 2.0;
  float box = max(abs(p.x), abs(p.y)) * 2.0;
  float a = 0.0;
  if (uKind == 0) {
    a = 1.0 - smoothstep(0.2, 0.27, d);
    a += (1.0 - smoothstep(0.2, 0.62, d)) * 0.35 * (0.75 + 0.25 * sin(uTime * 4.0));
  } else if (uKind == 1) {
    a = smoothstep(0.66, 0.74, d) * (1.0 - smoothstep(0.82, 0.9, d));
    a += smoothstep(0.8, 1.0, box) * 0.45 * (0.7 + 0.3 * sin(uTime * 5.0));
  } else if (uKind == 2) {
    a = 0.2 + smoothstep(0.82, 0.97, box) * 0.75;
  } else if (uKind == 3) {
    a = 0.16 + smoothstep(0.86, 1.0, box) * 0.2;
  } else if (uKind == 4) {
    a = (1.0 - smoothstep(0.0, 1.2, d)) * (0.65 + 0.35 * sin(uTime * 6.0));
  } else if (uKind == 5) {
    a = smoothstep(0.86, 0.98, box) * 0.55 + 0.05;
  } else {
    float pulse = 0.7 + 0.3 * sin(uTime * 3.5);
    a = smoothstep(0.42, 0.5, d) * (1.0 - smoothstep(0.7, 0.78, d)) * pulse;
    a += smoothstep(0.82, 0.97, box) * 0.8 * pulse + 0.22;
  }
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0) * uAlpha);
}
`;

const MARKER_COLORS: Record<MarkerKind, THREE.Color> = {
  [MarkerKind.Move]: new THREE.Color(1.3, 0.95, 0.4),
  [MarkerKind.Capture]: new THREE.Color(1.6, 0.25, 0.15),
  [MarkerKind.Selected]: new THREE.Color(1.2, 0.9, 0.35),
  [MarkerKind.LastMove]: new THREE.Color(0.45, 0.75, 1.1),
  [MarkerKind.Check]: new THREE.Color(2.2, 0.15, 0.08),
  [MarkerKind.Hover]: new THREE.Color(1.0, 1.0, 1.0),
  [MarkerKind.Guide]: new THREE.Color(0.15, 1.6, 0.55),
};

/** An arrow drawn on the board (puzzles): a hint, an opponent's threat, or a move of a line. */
export type ArrowKind = 'hint' | 'threat' | 'line';
const ARROW_COLORS: Record<ArrowKind, THREE.Color> = {
  hint: new THREE.Color(0.15, 1.6, 0.55),
  threat: new THREE.Color(1.8, 0.28, 0.16),
  line: new THREE.Color(1.4, 1.0, 0.4),
};
const ARROW_WIDTH = 0.2;
const HEAD_WIDTH = 0.5;
const HEAD_LENGTH = 0.42;

/**
 * The outline of an arrow from square to square, in board units (x, and z as y): straight,
 * or for a knight an L along the longer leg first, with a mitred corner.
 */
function arrowShape(from: Square, to: Square): THREE.Shape {
  const a = squareCenter(from);
  const b = squareCenter(to);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const knight = (Math.abs(dx) === 1 && Math.abs(dz) === 2) || (Math.abs(dx) === 2 && Math.abs(dz) === 1);
  const pts = [new THREE.Vector2(a.x, a.z)];
  if (knight) pts.push(Math.abs(dx) === 2 ? new THREE.Vector2(b.x, a.z) : new THREE.Vector2(a.x, b.z));
  pts.push(new THREE.Vector2(b.x, b.z));
  const dir = (i: number) => pts[i + 1].clone().sub(pts[i]).normalize();
  const normal = (d: THREE.Vector2) => new THREE.Vector2(-d.y, d.x);
  // start at the piece's edge, end a little before the square's centre
  const d0 = dir(0);
  const dl = dir(pts.length - 2);
  const start = pts[0].clone().addScaledVector(d0, 0.3);
  const tip = pts[pts.length - 1].clone().addScaledVector(dl, -0.12);
  const base = tip.clone().addScaledVector(dl, -HEAD_LENGTH);
  const hw = ARROW_WIDTH / 2;
  const n0 = normal(d0);
  const nl = normal(dl);
  const left: THREE.Vector2[] = [start.clone().addScaledVector(n0, hw)];
  const right: THREE.Vector2[] = [start.clone().addScaledVector(n0, -hw)];
  if (knight) {
    const corner = pts[1];
    const miter = n0.clone().add(nl);
    left.push(corner.clone().addScaledVector(miter, hw));
    right.push(corner.clone().addScaledVector(miter, -hw));
  }
  left.push(base.clone().addScaledVector(nl, hw), base.clone().addScaledVector(nl, HEAD_WIDTH / 2));
  right.push(base.clone().addScaledVector(nl, -hw), base.clone().addScaledVector(nl, -HEAD_WIDTH / 2));
  return new THREE.Shape([...left, tip, ...right.reverse()]);
}

class Arrow {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  constructor(from: Square, to: Square, kind: ArrowKind) {
    this.material = new THREE.MeshBasicMaterial({
      color: ARROW_COLORS[kind],
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.mesh = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape(from, to)), this.material);
    this.mesh.rotation.x = Math.PI / 2; // the shape's y becomes the board's z
    this.mesh.position.y = layout.boardTop + 0.02;
    this.mesh.renderOrder = 6;
    void animator.tween(0.25, (k) => (this.material.opacity = 0.8 * k), ease.outCubic);
  }

  tick(time: number): void {
    if (this.material.opacity >= 0.6) this.material.opacity = 0.72 + 0.1 * Math.sin(time * 3);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

class Marker {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(geometry: THREE.PlaneGeometry, kind: MarkerKind) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: MARKER_VERT,
      fragmentShader: MARKER_FRAG,
      uniforms: {
        uKind: { value: kind },
        uColor: { value: MARKER_COLORS[kind].clone() },
        uAlpha: { value: 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  show(sq: Square, alpha = 1, scale = 0.96): void {
    squareCenter(sq, this.mesh.position);
    this.mesh.position.y += 0.012;
    this.mesh.visible = true;
    const u = this.material.uniforms;
    const from = u.uAlpha.value as number;
    void animator.tween(0.18, (k) => {
      u.uAlpha.value = from + (alpha - from) * k;
      this.mesh.scale.setScalar(scale * (0.6 + 0.4 * k));
    }, ease.outBack);
  }

  hide(): void {
    this.mesh.visible = false;
    this.material.uniforms.uAlpha.value = 0;
  }

  tick(time: number): void {
    this.material.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.material.dispose();
  }
}

/**
 * Pieces on the board, square markers and mouse picking.
 * The `pieces` map always reflects the *logical* position (updated at the
 * start of each move, before animations play).
 */
export class BoardView {
  readonly pieces = new Map<Square, Piece>();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private targetMarkers: Marker[] = [];
  private readonly selectedMarker: Marker;
  private readonly lastFrom: Marker;
  private readonly lastTo: Marker;
  private readonly checkMarker: Marker;
  private readonly hoverMarker: Marker;
  private readonly guideFrom: Marker;
  private readonly guideTo: Marker;
  private hoverSquare: Square | null = null;
  private arrows: Arrow[] = [];
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** called for every new piece (the Wardrobe gives it its set) */
  dress: (piece: Piece) => void = () => {};
  /** which model a new piece is made from (the Wardrobe: its owner's set) */
  template = (color: Side, type: PieceSymbol) => this.assets.templates.get(`${color}${type}`);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: ChessAssets,
  ) {
    scene.add(assets.board);
    this.plane.constant = -layout.boardTop;
    this.selectedMarker = this.addMarker(MarkerKind.Selected);
    this.lastFrom = this.addMarker(MarkerKind.LastMove);
    this.lastTo = this.addMarker(MarkerKind.LastMove);
    this.checkMarker = this.addMarker(MarkerKind.Check);
    this.hoverMarker = this.addMarker(MarkerKind.Hover);
    this.guideFrom = this.addMarker(MarkerKind.Guide);
    this.guideTo = this.addMarker(MarkerKind.Guide);

    const fixed = [this.selectedMarker, this.lastFrom, this.lastTo, this.checkMarker, this.hoverMarker, this.guideFrom, this.guideTo];
    animator.onFrame((_, time) => {
      for (const m of fixed) m.tick(time);
      for (const m of this.targetMarkers) m.tick(time);
      for (const a of this.arrows) a.tick(time);
    });
  }

  createPiece(type: PieceSymbol, color: Side, square: Square): Piece {
    const template = this.template(color, type);
    if (!template) throw new Error(`Missing model for ${color}${type}`);
    const piece = new Piece(type, color, square, template);
    this.dress(piece);
    this.scene.add(piece.root);
    this.pieces.set(square, piece);
    return piece;
  }

  /** Throw away all piece objects and create them from the chess position. */
  rebuild(chess: Chess): Piece[] {
    for (const p of this.pieces.values()) p.dispose();
    this.pieces.clear();
    const created: Piece[] = [];
    for (const row of chess.board()) {
      for (const cell of row) {
        if (cell) created.push(this.createPiece(cell.type, cell.color, cell.square));
      }
    }
    return created;
  }

  findKing(color: Side): Piece | undefined {
    for (const p of this.pieces.values()) if (p.type === 'k' && p.color === color) return p;
    return undefined;
  }

  showTargets(moves: Move[]): void {
    this.clearTargets();
    const seen = new Set<Square>();
    for (const m of moves) {
      if (seen.has(m.to)) continue; // promotions list the same square four times
      seen.add(m.to);
      if (m.isEnPassant()) {
        // the pawn lands on an empty square and takes the pawn beside it: show both
        const move = this.addMarker(MarkerKind.Move);
        move.show(m.to, 0.95, 1);
        const victim = this.addMarker(MarkerKind.Capture);
        victim.show(`${m.to[0]}${m.from[1]}` as Square, 0.95, 1);
        this.targetMarkers.push(move, victim);
        continue;
      }
      const marker = this.addMarker(m.isCapture() ? MarkerKind.Capture : MarkerKind.Move);
      marker.show(m.to, 0.95, 1);
      this.targetMarkers.push(marker);
    }
  }

  clearTargets(): void {
    for (const m of this.targetMarkers) m.dispose();
    this.targetMarkers = [];
  }

  setSelected(sq: Square | null): void {
    if (sq) this.selectedMarker.show(sq, 0.9);
    else this.selectedMarker.hide();
  }

  setLastMove(from: Square | null, to: Square | null): void {
    if (from && to) {
      this.lastFrom.show(from, 0.8);
      this.lastTo.show(to, 0.9);
    } else {
      this.lastFrom.hide();
      this.lastTo.hide();
    }
  }

  setCheck(sq: Square | null): void {
    if (sq) this.checkMarker.show(sq, 1, 1.25);
    else this.checkMarker.hide();
  }

  /** Puzzle guidance that stays until cleared: the piece to move and the square it goes to. */
  setGuide(from: Square | null, to: Square | null): void {
    if (from) this.guideFrom.show(from, 0.9, 1);
    else this.guideFrom.hide();
    if (to) this.guideTo.show(to, 0.95, 1);
    else this.guideTo.hide();
  }

  /** Arrows on the board (puzzles), replacing the ones shown before. */
  setArrows(list: { from: Square; to: Square; kind: ArrowKind }[]): void {
    for (const a of this.arrows) a.dispose();
    this.arrows = list.map((x) => {
      const arrow = new Arrow(x.from, x.to, x.kind);
      this.scene.add(arrow.mesh);
      return arrow;
    });
  }

  setHover(sq: Square | null): void {
    if (sq === this.hoverSquare) return;
    this.hoverSquare = sq;
    if (sq) this.hoverMarker.show(sq, 0.55);
    else this.hoverMarker.hide();
  }

  /** Square under the ray: a piece's square if a piece is hit, else the board cell. */
  pick(raycaster: THREE.Raycaster): Square | null {
    const roots = [...this.pieces.values()].map((p) => p.root);
    const hit = raycaster.intersectObjects(roots, true)[0];
    if (hit) {
      const piece = hit.object.userData.piece as Piece | undefined;
      if (piece) return piece.square;
    }
    const point = raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
    if (!point) return null;
    return worldToSquare(point.x, point.z);
  }

  private addMarker(kind: MarkerKind): Marker {
    const marker = new Marker(this.geometry, kind);
    this.scene.add(marker.mesh);
    return marker;
  }
}
