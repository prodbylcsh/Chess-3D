import { Color, type Material, MeshDepthMaterial } from 'three';

export interface DissolveUniforms {
  /** 0 = intact, ~1.05 = fully gone. Small values (0.02–0.2) give glowing cracks. */
  uDissolve: { value: number };
  uEdgeColor: { value: Color };
  uEdgeWidth: { value: number };
  uNoiseScale: { value: number };
}

// 3D simplex noise — Ashima Arts / Stefan Gustavson (MIT). Prefixed to avoid clashes.
const NOISE = /* glsl */ `
vec3 dsv_mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 dsv_mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 dsv_permute(vec4 x){return dsv_mod289(((x*34.0)+10.0)*x);}
vec4 dsv_tis(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float dsv_snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=dsv_mod289(i);
  vec4 p=dsv_permute(dsv_permute(dsv_permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=dsv_tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const FRAG_HEAD = /* glsl */ `
varying vec3 vDsvPos;
uniform float uDissolve;
uniform float uEdgeWidth;
uniform float uNoiseScale;
uniform vec3 uEdgeColor;
${NOISE}
`;

const FRAG_DISCARD = /* glsl */ `
float dsvEdge = 0.0;
if (uDissolve > 0.0) {
  vec3 q = vDsvPos * uNoiseScale;
  float n = dsv_snoise(q) * 0.65 + dsv_snoise(q * 2.7 + 13.1) * 0.35;
  n = n * 0.5 + 0.5;
  if (n < uDissolve) discard;
  dsvEdge = 1.0 - smoothstep(uDissolve, uDissolve + uEdgeWidth, n);
}
`;

function patch(material: Material, u: DissolveUniforms, withEmissive: boolean): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDsvPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDsvPos = position;');
    let frag = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAG_DISCARD}`);
    if (withEmissive) {
      frag = frag.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uEdgeColor * dsvEdge;',
      );
    }
    shader.fragmentShader = frag;
  };
  material.customProgramCacheKey = () => (withEmissive ? 'dissolve-std' : 'dissolve-depth');
}

export function createDissolveUniforms(noiseScale: number): DissolveUniforms {
  return {
    uDissolve: { value: 0 },
    uEdgeColor: { value: new Color(4, 2, 0.6) },
    uEdgeWidth: { value: 0.08 },
    uNoiseScale: { value: noiseScale },
  };
}

/** Patch a lit material (MeshStandardMaterial & co.) for noise dissolve with glowing edges. */
export function applyDissolve(material: Material, uniforms: DissolveUniforms): void {
  patch(material, uniforms, true);
}

/** A shadow depth material that dissolves in sync with the visible one. */
export function createDissolveDepthMaterial(uniforms: DissolveUniforms): MeshDepthMaterial {
  const m = new MeshDepthMaterial();
  patch(m, uniforms, false);
  return m;
}
