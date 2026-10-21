import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    THREE: any;
  }
}

interface ThreeCanvasProps {
  reducedMotion: boolean;
  scrollProgress: number;
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ reducedMotion, scrollProgress }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.THREE) return;

    const THREE = window.THREE;
    let renderer: any;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(0, 0, 10);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 0.8);
    dl.position.set(3, 5, 6);
    scene.add(dl);

    function createCardTexture(draw: (ctx: CanvasRenderingContext2D) => void) {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 341;
      const ctx = c.getContext('2d');
      if (!ctx) return new THREE.Texture();
      ctx.fillStyle = '#16181D';
      ctx.fillRect(0, 0, 512, 341);
      ctx.strokeStyle = '#2A2D35';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, 508, 337);
      draw(ctx);
      const texture = new THREE.CanvasTexture(c);
      texture.anisotropy = 4;
      return texture;
    }

    function drawBars(ctx: CanvasRenderingContext2D, y: number, n: number, w: number, color?: string) {
      ctx.fillStyle = color || '#2A2D35';
      for (let i = 0; i < n; i++) {
        ctx.fillRect(32, y + i * 26, w - (i % 3) * 60, 10);
      }
    }

    const textures = [
      createCardTexture((ctx) => {
        ctx.fillStyle = '#0E0F12';
        ctx.fillRect(32, 32, 448, 210);
        ctx.fillStyle = '#ECEDEF';
        ctx.font = '500 22px Inter, sans-serif';
        ctx.fillText('Lecture 4: Backpropagation', 32, 282);
        ctx.fillStyle = '#2A2D35';
        ctx.fillRect(32, 302, 448, 6);
        ctx.fillStyle = '#FF7A2F';
        ctx.fillRect(32, 302, 200, 6);
        ctx.fillStyle = '#A0A4AE';
        ctx.font = '16px monospace';
        ctx.fillText('12:45 / 28:10', 366, 326);
        ctx.strokeStyle = '#A0A4AE';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(236, 110);
        ctx.lineTo(236, 164);
        ctx.lineTo(284, 137);
        ctx.closePath();
        ctx.stroke();
      }),
      createCardTexture((ctx) => {
        ctx.fillStyle = '#A0A4AE';
        ctx.font = '500 20px Inter, sans-serif';
        ctx.fillText('Chapter 2: Optimization', 32, 56);
        drawBars(ctx, 84, 7, 420);
        ctx.fillStyle = 'rgba(255, 122, 47, 0.25)';
        ctx.fillRect(28, 136, 456, 18);
        drawBars(ctx, 84, 7, 420, '#4a4f5c');
        ctx.fillStyle = '#ECEDEF';
        ctx.font = '16px monospace';
        ctx.fillText('p.4', 440, 320);
      }),
      createCardTexture((ctx) => {
        ctx.fillStyle = '#ECEDEF';
        ctx.font = '500 34px Inter, sans-serif';
        ctx.fillText('Chain rule', 32, 84);
        drawBars(ctx, 130, 4, 380, '#4a4f5c');
        ctx.fillStyle = '#A0A4AE';
        ctx.font = '16px monospace';
        ctx.fillText('Slide 7', 400, 320);
      }),
      createCardTexture((ctx) => {
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
          ctx.fillText(lines[i], 32, 70 + i * 34);
        }
      }),
    ];

    const group = new THREE.Group();
    scene.add(group);
    const cards: any[] = [];
    const edge = new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.9 });

    textures.forEach((tex) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(3, 2, 0.08),
        [
          edge,
          edge,
          edge,
          edge,
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }),
          new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.9 }),
        ]
      );
      group.add(mesh);
      cards.push(mesh);
    });

    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 6, 0.03),
      new THREE.MeshBasicMaterial({ color: 0xff7a2f })
    );
    line.position.z = 1.6;
    group.add(line);

    const keyframes = [
      [[-2.6, 1.4, -0.5, 0.35, 0.1], [2.8, 1.1, -1.8, -0.3, -0.1], [-2.2, -1.5, -1, 0.25, 0.05], [2.6, -1.5, 0.2, -0.35, 0.1]],
      [[0, 0, 0, 0, 0.05], [0, 0, 0.35, 0, -0.05], [0, 0, 0.7, 0, 0.08], [0, 0, 1.05, 0, -0.04]],
      [[0, 0.3, 2.2, 0, 0], [0, 0, 0.35, 0, -0.05], [0, 0, 0.7, 0, 0.08], [0, 0, 1.05, 0, -0.04]],
      [[-2.2, -0.1, 0, 0.25, -0.3], [-0.75, 0.1, 0.2, 0.1, -0.1], [0.75, 0.1, 0.4, -0.1, 0.1], [2.2, -0.1, 0.6, -0.25, 0.3]],
      [[-1.65, 1.15, 0, 0, 0], [1.65, 1.15, 0, 0, 0], [-1.65, -1.15, 0, 0, 0], [1.65, -1.15, 0, 0, 0]],
    ];

    function smooth(t: number) {
      return t * t * (3 - 2 * t);
    }

    function handleResize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const mobile = w < 700;
      group.position.set(mobile ? 0 : 3.1, mobile ? 1.6 : 0, 0);
      group.scale.setScalar(mobile ? 0.5 : 0.78);
    }

    handleResize();
    window.addEventListener('resize', handleResize);

    let animationId: number;
    let currentProgress = scrollProgress;

    function render(now: number) {
      currentProgress += (scrollProgress - currentProgress) * (reducedMotion ? 1 : 0.08);
      const s = currentProgress * 4;
      let i = Math.min(3, Math.floor(s));
      let f = smooth(s - i);
      if (currentProgress >= 1) {
        i = 3;
        f = 1;
      }

      const t = now / 1000;
      const drift = reducedMotion ? 0 : 1;

      cards.forEach((c, n) => {
        const a = keyframes[i][n];
        const b = keyframes[i + 1][n];
        c.position.set(
          a[0] + (b[0] - a[0]) * f + Math.sin(t * 0.5 + n) * 0.25 * drift,
          a[1] + (b[1] - a[1]) * f + Math.cos(t * 0.45 + n) * 0.25 * drift,
          a[2] + (b[2] - a[2]) * f
        );
        c.rotation.y = a[3] + (b[3] - a[3]) * f + Math.sin(t * 0.6 + n) * 0.14 * drift;
        c.rotation.z = a[4] + (b[4] - a[4]) * f;
      });

      line.position.x = -3 + 6 * currentProgress;
      camera.position.x = (currentProgress - 0.5) * 0.6;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);

      if (!reducedMotion) {
        animationId = requestAnimationFrame(render);
      }
    }

    if (!reducedMotion) {
      animationId = requestAnimationFrame(render);
    } else {
      render(0);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationId) cancelAnimationFrame(animationId);
      renderer.dispose();
    };
  }, [reducedMotion, scrollProgress]);

  return (
    <canvas
      ref={canvasRef}
      id="gl"
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
};
