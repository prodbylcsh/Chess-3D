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
  } else {
    a = smoothstep(0.86, 0.98, box) * 0.55 + 0.05;
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
};

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
  private hoverSquare: Square | null = null;
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

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

    const fixed = [this.selectedMarker, this.lastFrom, this.lastTo, this.checkMarker, this.hoverMarker];
    animator.onFrame((_, time) => {
      for (const m of fixed) m.tick(time);
      for (const m of this.targetMarkers) m.tick(time);
    });
  }

  createPiece(type: PieceSymbol, color: Side, square: Square): Piece {
    const template = this.assets.templates.get(`${color}${type}`);
    if (!template) throw new Error(`Missing model for ${color}${type}`);
    const piece = new Piece(type, color, square, template);
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
      const marker = this.addMarker(m.isCapture() || m.isEnPassant() ? MarkerKind.Capture : MarkerKind.Move);
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
