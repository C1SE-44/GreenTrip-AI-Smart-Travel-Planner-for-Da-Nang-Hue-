import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface ThreeElevationWaveProps {
  className?: string;
  co2SavedKg?: number;
}

export const ThreeElevationWave: React.FC<ThreeElevationWaveProps> = ({
  className = '',
  co2SavedKg = 2.4,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 300;
    const height = container.clientHeight || 70;

    // 1. Scene, Camera, Renderer (Threejs fundamentals)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 5, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. Geometry: Topographic ribbon curve (Elevation of Da Nang -> Hai Van -> Hue)
    const segmentsX = 40;
    const segmentsY = 12;
    const geometry = new THREE.PlaneGeometry(16, 4, segmentsX, segmentsY);
    geometry.rotateX(-Math.PI / 2.5);

    // Custom shader-like vertex displacement using geometry attributes
    const pos = geometry.attributes.position;
    const initialY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      initialY[i] = pos.getY(i);
    }

    // 3. Material: Eco-Emerald & Teal Wireframe gradient
    const material = new THREE.MeshBasicMaterial({
      color: 0x059669,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Floating eco particles
    const particleCount = 25;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePos[i] = (Math.random() - 0.5) * 14;
      particlePos[i + 1] = Math.random() * 2 + 0.5;
      particlePos[i + 2] = (Math.random() - 0.5) * 4;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x34d399,
      size: 0.12,
      transparent: true,
      opacity: 0.8,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 4. Animation loop
    let animId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Undulate topographic wave
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const wave = Math.sin(x * 0.6 + elapsed * 1.5) * Math.cos(z * 0.8 + elapsed) * 0.6;
        pos.setY(i, initialY[i] + wave);
      }
      pos.needsUpdate = true;

      // Particle gentle sway
      particles.rotation.y = elapsed * 0.05;

      renderer.render(scene, camera);
    };
    animate();

    // 5. Responsive resize
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup (Three.js performance best practice)
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      geometry.dispose();
      material.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/90 via-teal-900/90 to-neutral-900 text-white p-3.5 border border-emerald-500/20 shadow-sm ${className}`}>
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[12px] font-bold tracking-wide uppercase text-emerald-300">
            Cao độ & Hành trình Xanh
          </span>
        </div>
        <span className="text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30">
          🍃 Giảm ~{co2SavedKg}kg CO₂
        </span>
      </div>

      {/* Three.js 3D Canvas Mount Point */}
      <div ref={mountRef} className="w-full h-[65px] mt-1 cursor-grab active:cursor-grabbing pointer-events-none" />

      <div className="relative z-10 flex items-center justify-between text-[11px] text-neutral-400 mt-0.5">
        <span>Bờ biển Đà Nẵng (0m)</span>
        <span className="text-emerald-400 font-bold">Đèo Hải Vân (496m)</span>
        <span>Sông Hương Huế (5m)</span>
      </div>
    </div>
  );
};
