import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface Scene3DProps {
  scrollProgress: number;
  reducedMotion: boolean;
  onStatusChange?: (status: string) => void;
}

export const Scene3D: React.FC<Scene3DProps> = ({
  scrollProgress,
  reducedMotion,
  onStatusChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [webGLError, setWebGLError] = useState<string | null>(null);
  const [isMobileOrLowPower, setIsMobileOrLowPower] = useState(false);

  useEffect(() => {
    // Check mobile or low power preference
    const checkMobile = window.innerWidth < 640;
    setIsMobileOrLowPower(checkMobile);
  }, []);

  useEffect(() => {
    if (isMobileOrLowPower) {
      onStatusChange?.('CSS Fallback (Mobile)');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check WebGL availability
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'default',
      });
      onStatusChange?.('Active (WebGL 3D)');
    } catch {
      setWebGLError('WebGL is not available in your browser.');
      onStatusChange?.('Failed (WebGL Error)');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(0, 0, 9.5);

    // Soft lighting, no bloom, no glow
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(3, 4, 5);
    scene.add(dirLight);

    // Textures creation
    const texturesToDispose: THREE.Texture[] = [];
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];

    function makeTexture(draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
      const cv = document.createElement('canvas');
      cv.width = 512;
      cv.height = 340;
      const ctx = cv.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#16181D';
        ctx.fillRect(0, 0, 512, 340);
        ctx.strokeStyle = '#2A2D35';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 508, 336);
        draw(ctx);
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = 4;
      texturesToDispose.push(tex);
      return tex;
    }

    function drawBars(ctx: CanvasRenderingContext2D, startY: number, count: number, width: number, col = '#2A2D35') {
      ctx.fillStyle = col;
      for (let i = 0; i < count; i++) {
        ctx.fillRect(32, startY + i * 24, width - (i % 3) * 50, 9);
      }
    }

    // 1. Video frame with timeline bar
    const videoTex = makeTexture((ctx) => {
      ctx.fillStyle = '#0E0F12';
      ctx.fillRect(32, 32, 448, 200);
      ctx.fillStyle = '#ECEDEF';
      ctx.font = '500 20px Inter, sans-serif';
      ctx.fillText('Lecture 4: Backpropagation', 32, 270);
      ctx.fillStyle = '#2A2D35';
      ctx.fillRect(32, 290, 448, 6);
      ctx.fillStyle = '#FF7A2F';
      ctx.fillRect(32, 290, 210, 6);
      ctx.fillStyle = '#A0A4AE';
      ctx.font = '14px monospace';
      ctx.fillText('12:45 / 28:10', 360, 316);
      ctx.strokeStyle = '#A0A4AE';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(240, 105);
      ctx.lineTo(240, 155);
      ctx.lineTo(280, 130);
      ctx.closePath();
      ctx.stroke();
    });

    // 2. PDF page marked "p.4"
    const pdfTex = makeTexture((ctx) => {
      ctx.fillStyle = '#A0A4AE';
      ctx.font = '500 18px Inter, sans-serif';
      ctx.fillText('Chapter 2: Optimization', 32, 52);
      drawBars(ctx, 80, 6, 420);
      ctx.fillStyle = 'rgba(255, 122, 47, 0.25)';
      ctx.fillRect(28, 130, 456, 18);
      drawBars(ctx, 80, 6, 420, '#4A4F5C');
      ctx.fillStyle = '#ECEDEF';
      ctx.font = '16px monospace';
      ctx.fillText('p.4', 440, 310);
    });

    // 3. Slide marked "Slide 7"
    const slideTex = makeTexture((ctx) => {
      ctx.fillStyle = '#ECEDEF';
      ctx.font = '500 32px Inter, sans-serif';
      ctx.fillText('Chain rule', 32, 80);
      drawBars(ctx, 124, 4, 380, '#4A4F5C');
      ctx.fillStyle = '#A0A4AE';
      ctx.font = '16px monospace';
      ctx.fillText('Slide 7', 390, 310);
    });

    // 4. Code card in IBM Plex Mono
    const codeTex = makeTexture((ctx) => {
      ctx.fillStyle = '#A0A4AE';
      ctx.font = '15px monospace';
      const lines = [
        'def backward(self, grad):',
        '    dw = self.x.T @ grad',
        '    self.w -= self.lr * dw',
        '    return grad @ self.w.T',
        '',
        '# net.py, lines 41-44',
      ];
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i === 5 ? '#FF7A2F' : '#ECEDEF';
        ctx.fillText(lines[i], 32, 68 + i * 32);
      }
    });

    const cardGroup = new THREE.Group();
    scene.add(cardGroup);

    const cardMeshes: THREE.Mesh[] = [];
    const boxGeo = new THREE.BoxGeometry(2.9, 1.95, 0.07);
    geometriesToDispose.push(boxGeo);

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.9 });
    materialsToDispose.push(edgeMat);

    [videoTex, pdfTex, slideTex, codeTex].forEach((tex) => {
      const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      materialsToDispose.push(faceMat);
      const backMat = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.9 });
      materialsToDispose.push(backMat);

      const mesh = new THREE.Mesh(boxGeo, [
        edgeMat,
        edgeMat,
        edgeMat,
        edgeMat,
        faceMat,
        backMat,
      ]);
      cardGroup.add(mesh);
      cardMeshes.push(mesh);
    });

    // Thin orange playhead line crossing the scene
    const lineGeo = new THREE.BoxGeometry(0.025, 5.5, 0.025);
    geometriesToDispose.push(lineGeo);
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xff7a2f });
    materialsToDispose.push(lineMat);
    const playheadLine = new THREE.Mesh(lineGeo, lineMat);
    playheadLine.position.z = 1.4;
    cardGroup.add(playheadLine);

    // 5 Stages of motion:
    // Stage 0: spread apart
    // Stage 1: stacked
    // Stage 2: one card pulled forward
    // Stage 3: fanned out
    // Stage 4: 2x2 grid
    // Keyframe format: [x, y, z, rotY, rotZ]
    const keyframes = [
      // 0. spread apart
      [[-2.5, 1.3, -0.6, 0.35, 0.1], [2.6, 1.1, -1.5, -0.3, -0.1], [-2.1, -1.4, -0.9, 0.25, 0.05], [2.4, -1.4, 0.2, -0.35, 0.1]],
      // 1. stacked
      [[0, 0, 0, 0, 0.05], [0, 0, 0.32, 0, -0.05], [0, 0, 0.64, 0, 0.08], [0, 0, 0.96, 0, -0.04]],
      // 2. one card pulled forward
      [[0, 0.25, 2.2, 0, 0], [0, 0, 0.32, 0, -0.05], [0, 0, 0.64, 0, 0.08], [0, 0, 0.96, 0, -0.04]],
      // 3. fanned out
      [[-2.1, -0.1, 0, 0.25, -0.3], [-0.7, 0.1, 0.2, 0.1, -0.1], [0.7, 0.1, 0.4, -0.1, 0.1], [2.1, -0.1, 0.6, -0.25, 0.3]],
      // 4. 2x2 grid
      [[-1.6, 1.1, 0, 0, 0], [1.6, 1.1, 0, 0, 0], [-1.6, -1.1, 0, 0, 0], [1.6, -1.1, 0, 0, 0]],
    ];

    function smoothBlend(t: number) {
      return t * t * (3 - 2 * t);
    }

    function handleResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      const isNarrow = w < 860;
      cardGroup.position.set(isNarrow ? 0 : 2.9, isNarrow ? 1.5 : 0, 0);
      cardGroup.scale.setScalar(isNarrow ? 0.52 : 0.76);
    }

    handleResize();
    window.addEventListener('resize', handleResize);

    let animId: number;
    let localProgress = scrollProgress;

    function renderLoop(now: number) {
      localProgress += (scrollProgress - localProgress) * (reducedMotion ? 1 : 0.08);

      const stageCoord = localProgress * 4;
      let stageIdx = Math.min(3, Math.floor(stageCoord));
      let f = smoothBlend(stageCoord - stageIdx);
      if (localProgress >= 1) {
        stageIdx = 3;
        f = 1;
      }

      const time = now / 1000;
      // Slow idle float and turn
      const drift = reducedMotion ? 0 : 1;

      cardMeshes.forEach((mesh, idx) => {
        const a = keyframes[stageIdx][idx];
        const b = keyframes[stageIdx + 1][idx];

        mesh.position.set(
          a[0] + (b[0] - a[0]) * f + Math.sin(time * 0.45 + idx) * 0.22 * drift,
          a[1] + (b[1] - a[1]) * f + Math.cos(time * 0.4 + idx) * 0.22 * drift,
          a[2] + (b[2] - a[2]) * f
        );
        mesh.rotation.y = a[3] + (b[3] - a[3]) * f + Math.sin(time * 0.55 + idx) * 0.12 * drift;
        mesh.rotation.z = a[4] + (b[4] - a[4]) * f;
      });

      playheadLine.position.x = -2.8 + 5.6 * localProgress;
      camera.position.x = (localProgress - 0.5) * 0.5;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);

      if (!reducedMotion) {
        animId = requestAnimationFrame(renderLoop);
      }
    }

    if (!reducedMotion) {
      animId = requestAnimationFrame(renderLoop);
    } else {
      renderLoop(0);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animId) cancelAnimationFrame(animId);
      texturesToDispose.forEach((t) => t.dispose());
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
      renderer.dispose();
    };
  }, [scrollProgress, reducedMotion, isMobileOrLowPower, onStatusChange]);

  if (webGLError) {
    return (
      <div className="fixed inset-0 z-0 flex items-center justify-center p-6 text-center pointer-events-none">
        <div className="p-4 bg-[#16181D]/90 border border-[#2A2D35] rounded-[12px] text-xs text-[#A0A4AE]">
          3D scene paused: {webGLError} Showing standard view.
        </div>
      </div>
    );
  }

  if (isMobileOrLowPower) {
    return (
      /* Static CSS version for mobile & low power */
      <div
        ref={containerRef}
        aria-hidden="true"
        className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none opacity-40 overflow-hidden"
      >
        <div className="grid grid-cols-2 gap-3 w-72">
          <div className="h-20 bg-[#16181D] border border-[#2A2D35] rounded-[8px] p-2 text-[10px] text-[#A0A4AE]">
            Lecture 4
          </div>
          <div className="h-20 bg-[#16181D] border border-[#2A2D35] rounded-[8px] p-2 text-[10px] text-[#A0A4AE]">
            Chapter 2 (p.4)
          </div>
          <div className="h-20 bg-[#16181D] border border-[#2A2D35] rounded-[8px] p-2 text-[10px] text-[#A0A4AE]">
            Slide 7
          </div>
          <div className="h-20 bg-[#16181D] border border-[#2A2D35] rounded-[8px] p-2 text-[10px] font-mono text-[#A0A4AE]">
            net.py
          </div>
        </div>
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
};
