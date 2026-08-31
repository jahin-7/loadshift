import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { Group, Mesh, MeshStandardMaterial } from 'three';
import type { ActualPowerKind } from '../lib/api.js';

function ExhaustPuffs() {
  const group = useRef<Group>(null);
  useFrame((state) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const t = (state.clock.elapsedTime + i * 0.6) % 1.8;
      child.position.y = t * 0.6;
      const material = (child as Mesh).material as MeshStandardMaterial;
      material.opacity = Math.max(0, 1 - t / 1.8);
    });
  });
  return (
    <group ref={group} position={[0.35, 0.55, 0]}>
      {[0, 1, 2].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#cccccc" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function GeneratorModel({ active }: { active: boolean }) {
  const bodyRef = useRef<Mesh>(null);
  useFrame((state) => {
    if (bodyRef.current) {
      bodyRef.current.position.y = active ? Math.sin(state.clock.elapsedTime * 40) * 0.008 : 0;
    }
  });

  return (
    <group position={[-0.9, -0.15, 0]}>
      <mesh ref={bodyRef}>
        <boxGeometry args={[0.8, 0.6, 0.7]} />
        <meshStandardMaterial
          color={active ? '#e8934a' : '#5c5648'}
          emissive={active ? '#c9631f' : '#000000'}
          emissiveIntensity={active ? 0.5 : 0}
        />
      </mesh>
      <mesh position={[0.25, 0.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
        <meshStandardMaterial color="#332e22" />
      </mesh>
      {active && <ExhaustPuffs />}
    </group>
  );
}

function SolarPanelModel({ active }: { active: boolean }) {
  return (
    <group position={[0, -0.2, 0]} rotation={[-0.55, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.85, 0.55, 0.035]} />
        <meshStandardMaterial
          color={active ? '#f2c94c' : '#494632'}
          emissive={active ? '#f2c94c' : '#000000'}
          emissiveIntensity={active ? 0.4 : 0}
        />
      </mesh>
      {[-0.28, 0, 0.28].map((x) => (
        <mesh key={x} position={[x, 0, 0.02]}>
          <boxGeometry args={[0.01, 0.55, 0.005]} />
          <meshStandardMaterial color="#201d12" />
        </mesh>
      ))}
      <mesh position={[0, -0.32, -0.2]} rotation={[0.55, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.35, 6]} />
        <meshStandardMaterial color="#726b58" />
      </mesh>
    </group>
  );
}

function PylonModel({ active }: { active: boolean }) {
  return (
    <group position={[0.9, -0.15, 0]}>
      <mesh>
        <boxGeometry args={[0.08, 1, 0.08]} />
        <meshStandardMaterial color="#726b58" />
      </mesh>
      <mesh position={[0, 0.28, 0]} rotation={[0, 0, Math.PI / 5]}>
        <boxGeometry args={[0.55, 0.05, 0.05]} />
        <meshStandardMaterial color="#726b58" />
      </mesh>
      <mesh position={[0, 0.05, 0]} rotation={[0, 0, -Math.PI / 5]}>
        <boxGeometry args={[0.55, 0.05, 0.05]} />
        <meshStandardMaterial color="#726b58" />
      </mesh>
      <mesh position={[0, 0.58, 0]}>
        <coneGeometry args={[0.08, 0.22, 6]} />
        <meshStandardMaterial
          color={active ? '#3fa9e0' : '#524c3c'}
          emissive={active ? '#3fa9e0' : '#000000'}
          emissiveIntensity={active ? 0.9 : 0}
        />
      </mesh>
    </group>
  );
}

interface PowerSceneProps {
  activePower: ActualPowerKind | null;
  hasSolar?: boolean;
}

export default function PowerScene({ activePower, hasSolar = false }: PowerSceneProps) {
  return (
    <div className="power-scene">
      <Canvas camera={{ position: [0, 0.5, 2.6], fov: 38 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#211d16']} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[2, 3, 2]} intensity={1.2} />
        <directionalLight position={[-2, 1, 1]} intensity={0.4} />
        <GeneratorModel active={activePower === 'generator'} />
        {hasSolar && <SolarPanelModel active={activePower === 'solar'} />}
        <PylonModel active={activePower === 'grid'} />
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
      <div className="power-scene__caption">
        <span className={activePower === 'generator' ? 'is-active' : ''}>
          <span className="dot dot--generator" /> Generator
        </span>
        {hasSolar && (
          <span className={activePower === 'solar' ? 'is-active' : ''}>
            <span className="dot dot--solar" /> Solar
          </span>
        )}
        <span className={activePower === 'grid' ? 'is-active' : ''}>
          <span className="dot dot--grid" /> Mains
        </span>
        {activePower === 'none' && <span className="is-active">No power needed right now</span>}
      </div>
    </div>
  );
}
