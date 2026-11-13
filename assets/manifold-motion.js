(() => {
  'use strict';

  const figure = document.querySelector('.manifold-figure');
  if (!figure) return;
  const stage = figure.querySelector('.manifold-stage');
  const canvas = stage.querySelector('canvas');
  const poster = stage.querySelector('img');
  const toggle = figure.querySelector('button');
  const context = canvas.getContext('2d');
  const shell = document.createElement('canvas');
  const shellContext = shell.getContext('2d');
  if (!context || !shellContext) return;

  const width = 800;
  const height = 580;
  const turns = Math.PI * 2;
  const columns = 104;
  const rows = 30;
  const clamp = value => Math.max(0, Math.min(1, value));
  const mix = (low, high, weight) => low + (high - low) * weight;
  const palette = (low, high, t) => 'rgb(' + low.map((v,i) => Math.round(mix(v, high[i], clamp(t)))).join(',') + ')';

  // Use the same bent torus and camera as the original Manifold Monolith illustration.
  function surface(u, v) {
    const radius = 1.32 + .17 * Math.cos(3 * u + .4);
    const tube = .47 + .10 * Math.sin(2 * u - .45);
    const sweep = radius + tube * Math.cos(v);
    const x = sweep * Math.cos(u);
    const y = sweep * Math.sin(u);
    const z = tube * Math.sin(v) + .57 * Math.sin(2 * u + .6);
    const tiltedY = .67 * y - .742 * z;
    return {x: .91 * x - .415 * tiltedY, y: .415 * x + .91 * tiltedY, z: .742 * y + .67 * z};
  }

  const vertices = Array.from({length: columns}, (_,i) =>
    Array.from({length: rows}, (_,j) => surface(turns * i / columns, turns * j / rows)));
  const all = vertices.flat();
  const bounds = key => {
    const values = all.map(p => p[key]);
    return [Math.min(...values), Math.max(...values)];
  };
  const [left, right] = bounds('x');
  const [bottom, top] = bounds('y');
  const [far, near] = bounds('z');
  const scale = Math.min((width - 46) / (right - left), (height - 40) / (top - bottom));
  function project(p) {
    return {
      x: width / 2 + (p.x - (left + right) / 2) * scale,
      y: height / 2 - (p.y - (bottom + top) / 2) * scale,
      z: (p.z - far) / (near - far)
    };
  }

  const faces = [];
  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const nextI = (i + 1) % columns;
      const nextJ = (j + 1) % rows;
      const [a,b,c,d] = [vertices[i][j], vertices[nextI][j], vertices[nextI][nextJ], vertices[i][nextJ]];
      const nx = (b.y-a.y)*(d.z-a.z) - (b.z-a.z)*(d.y-a.y);
      const ny = (b.z-a.z)*(d.x-a.x) - (b.x-a.x)*(d.z-a.z);
      const nz = (b.x-a.x)*(d.y-a.y) - (b.y-a.y)*(d.x-a.x);
      const light = clamp((-.43*nx + .63*ny + .65*nz) / (Math.hypot(nx,ny,nz) || 1));
      const corners = [a,b,c,d].map(project);
      faces.push({corners, light, depth: corners.reduce((sum,p) => sum+p.z,0)/4});
    }
  }
  faces.sort((a,b) => a.depth-b.depth);

  // A small depth buffer keeps light trails on the visible side of the curved mesh.
  const depthWidth = width / 2;
  const depth = new Float32Array(depthWidth * height / 2).fill(-1);
  function rasterize(a,b,c) {
    const minX = Math.max(0, Math.floor(Math.min(a.x,b.x,c.x)/2));
    const maxX = Math.min(depthWidth-1, Math.ceil(Math.max(a.x,b.x,c.x)/2));
    const minY = Math.max(0, Math.floor(Math.min(a.y,b.y,c.y)/2));
    const maxY = Math.min(height/2-1, Math.ceil(Math.max(a.y,b.y,c.y)/2));
    const area = (b.y-c.y)*(a.x-c.x) + (c.x-b.x)*(a.y-c.y);
    if (Math.abs(area)<.001) return;
    for (let y=minY; y<=maxY; y++) {
      for (let x=minX; x<=maxX; x++) {
        const dx = 2*x+1-c.x, dy = 2*y+1-c.y;
        const wa = ((b.y-c.y)*dx + (c.x-b.x)*dy)/area;
        const wb = ((c.y-a.y)*dx + (a.x-c.x)*dy)/area;
        const wc = 1-wa-wb;
        if (wa<0 || wb<0 || wc<0) continue;
        const k=y*depthWidth+x;
        depth[k]=Math.max(depth[k],wa*a.z+wb*b.z+wc*c.z);
      }
    }
  }
  faces.forEach(({corners:[a,b,c,d]}) => { rasterize(a,b,c); rasterize(a,c,d); });

  function buildShell() {
    const ctx = shellContext;
    ctx.setTransform(shell.width/width,0,0,shell.height/height,0,0);
    ctx.lineJoin = 'round';
    for (const {corners:[a,b,c,d],light,depth:z} of faces) {
      ctx.beginPath();
      ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y); ctx.closePath();
      ctx.fillStyle = palette([17,32,36],[97,75,40],.10*z + .69*light*light);
      ctx.fill();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = .68;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y);
      ctx.strokeStyle = palette([106,85,54],[250,220,149],.33*z*z + .72*light);
      ctx.lineWidth = .67 + .44*z;
      ctx.stroke();
    }
  }

  const sampleCount = 480;
  const trails = [2,7,13,20,25].map((row,k) => {
    const points = Array.from({length: sampleCount}, (_,i) => {
      const p = project(surface(turns*i/sampleCount, turns*row/rows));
      const z = depth[Math.floor(p.y/2)*depthWidth + Math.floor(p.x/2)];
      return {...p, visible: z>=0 && p.z+.014>=z};
    });
    return {points, start: [.08,.53,.81,.31,.66][k], direction: k===2?-1:1};
  });

  let drawingScale = 1;
  function frame(seconds) {
    context.clearRect(0,0,canvas.width,canvas.height);
    context.save();
    context.scale(drawingScale,drawingScale);
    context.translate(width/2,height/2);
    const angle=turns*seconds/12;
    context.rotate(.020*Math.sin(angle));
    context.scale(1+.009*Math.sin(angle),1);
    context.translate(-width/2,-height/2+1.8*Math.sin(angle));
    context.drawImage(shell,0,0,width,height);
    context.lineCap='round';
    for (const {points,start,direction} of trails) {
      const cycle = (start + direction*seconds/12) % 1;
      const position = (cycle+1)*sampleCount;
      for (let k=29; k>=0; k--) {
        const i = Math.floor(position-direction*k+sampleCount) % sampleCount;
        const j = (i+direction+sampleCount)%sampleCount;
        const a=points[i], b=points[j];
        if (!a.visible || !b.visible) continue;
        const strength=(1-k/30)**1.8;
        context.beginPath(); context.moveTo(a.x,a.y); context.lineTo(b.x,b.y);
        context.strokeStyle='rgba(255,213,119,'+(.04+.88*strength)+')';
        context.lineWidth=.9+1.85*strength;
        context.stroke();
        if(k===0) {
          const fraction=position-Math.floor(position);
          const neighbor=points[(i+1)%sampleCount];
          const x=mix(a.x,neighbor.x,fraction), y=mix(a.y,neighbor.y,fraction);
          const bloom=context.createRadialGradient(x,y,0,x,y,8);
          bloom.addColorStop(0,'rgba(255,241,189,.88)');
          bloom.addColorStop(.25,'rgba(255,202,96,.52)');
          bloom.addColorStop(1,'rgba(255,175,65,0)');
          context.fillStyle=bloom; context.fillRect(x-8,y-8,16,16);
          context.beginPath(); context.arc(x,y,1.65,0,turns); context.fillStyle='#fff1bf'; context.fill();
        }
      }
    }
    context.restore();
  }

  const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused=motionPreference.matches;
  let inView=false;
  let elapsed=0;
  let tick=0;
  let previous=null;
  function resize() {
    const rect=stage.getBoundingClientRect();
    if(!rect.width || !rect.height) return;
    const ratio=Math.min(window.devicePixelRatio || 1,2);
    const fitted=Math.min(rect.width/width,rect.height/height);
    const w=Math.max(1,Math.round(width*fitted*ratio));
    const h=Math.max(1,Math.round(height*fitted*ratio));
    if(shell.width!==w || shell.height!==h || canvas.hidden) {
      shell.width=canvas.width=w;
      shell.height=canvas.height=h;
      drawingScale=w/width;
      buildShell();
      frame(elapsed);
      canvas.hidden=false;
      poster.hidden=true;
    }
  }
  function animate(now) {
    if(previous===null) previous=now;
    if(now-previous>=1000/30) {
      elapsed=(elapsed+(now-previous)/1000)%12;
      previous=now;
      frame(elapsed);
    }
    tick=requestAnimationFrame(animate);
  }
  function updatePlayback() {
    cancelAnimationFrame(tick);
    previous=null;
    toggle.toggleAttribute('data-paused',paused);
    const label=paused?'播放流形動畫':'暫停流形動畫';
    toggle.setAttribute('aria-label',label);
    toggle.title=label;
    if(!paused && inView && !document.hidden) tick=requestAnimationFrame(animate);
  }
  resize();
  if('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize',resize);
  toggle.hidden=false;
  toggle.addEventListener('click',() => {paused=!paused; updatePlayback();});
  motionPreference.addEventListener('change',e => {paused=e.matches; updatePlayback();});
  document.addEventListener('visibilitychange',updatePlayback);
  if('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {inView=entries[0].isIntersecting; updatePlayback();}).observe(stage);
  } else inView=true;
  updatePlayback();
})();
