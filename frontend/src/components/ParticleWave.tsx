import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const COLS = 90;
const ROWS = 70;
const SPACING = 0.4;
const AMP_X = 1.1;
const AMP_Z = 1.4;
const FREQ_X = 0.28;
const FREQ_Z = 0.22;
const TIME_X = 0.5;
const TIME_Z = 0.35;

function WaveField() {
  const pointsRef = useRef<THREE.Points>(null);

  const initialPositions = useMemo(() => {
    const arr = new Float32Array(COLS * ROWS * 3);
    let i = 0;
    for (let xi = 0; xi < COLS; xi++) {
      for (let zi = 0; zi < ROWS; zi++) {
        arr[i++] = (xi - COLS / 2) * SPACING;
        arr[i++] = 0;
        arr[i++] = (zi - ROWS / 2) * SPACING;
      }
    }
    return arr;
  }, []);

  useFrame((state) => {
    const pts = pointsRef.current;
    if (!pts) return;
    const t = state.clock.getElapsedTime();
    const positions = pts.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      positions[i + 1] =
        Math.sin(x * FREQ_X + t * TIME_X) * AMP_X +
        Math.sin(z * FREQ_Z + t * TIME_Z) * AMP_Z;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[initialPositions, 3]}
          count={COLS * ROWS}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#ffffff"
        size={0.05}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
      />
    </points>
  );
}

export default function ParticleWave() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas
        camera={{ position: [0, 6, 18], fov: 45, near: 0.1, far: 80 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <fog attach="fog" args={["#09090b", 14, 38]} />
        <WaveField />
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/60 via-transparent to-zinc-950" />
    </div>
  );
}
