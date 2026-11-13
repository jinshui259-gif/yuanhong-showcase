(() => {
  'use strict';

  const figure = document.querySelector('.manifold-figure');
  if (!figure) return;
  const stage = figure.querySelector('.manifold-stage');
  const canvas = stage.querySelector('canvas');
  const poster = stage.querySelector('img');
  const toggle = figure.querySelector('button');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = 800;
  const height = 580;
  const period = 12;
  const tau = 2 * Math.PI;
  const rings = 84;
  const sides = 24;
  const points = [];
  const faces = [];
  const visible = [];

  // A closed, oval-section tube with one half-twist. Crossing the seam
  // continues on the opposite side of the oval's local coordinate frame.
  function vertex(u, v) {
    const major = 1.32 + .17 * Math.cos(3*u + .4);
    const thickness = .47 + .10 * Math.sin(2*u - .45);
    const twist = u*.5 + .32;
    const wide = thickness * 1.27 * Math.cos(v);
    const thin = thickness * .74 * Math.sin(v);
    const radial = wide*Math.cos(twist) - thin*Math.sin(twist);
    const x = (major + radial)*Math.cos(u);
    const y = (major + radial)*Math.sin(u);
    const z = .57*Math.sin(2*u + .6) + wide*Math.sin(twist) + thin*Math.cos(twist);

    // Start from the same three-quarter view as the original artwork.
    const tiltedY = .67*y - .742*z;
    return {x: .91*x-.415*tiltedY, y: .415*x+.91*tiltedY, z: .742*y+.67*z,
            sx: 0, sy: 0, depth: 0};
  }

  for (let i=0; i<rings; i++) {
    for (let j=0; j<sides; j++) points.push(vertex(tau*i/rings,tau*j/sides));
  }
  function corner(i,j) {
    const seamOffset = i === rings ? sides/2 : 0;
    return points[(i % rings)*sides + (j+seamOffset) % sides];
  }
  for (let i=0; i<rings; i++) {
    for (let j=0; j<sides; j++) {
      const a=corner(i,j), b=corner(i+1,j), c=corner(i+1,j+1), d=corner(i,j+1);
      const abx=b.x-a.x, aby=b.y-a.y, abz=b.z-a.z;
      const adx=d.x-a.x, ady=d.y-a.y, adz=d.z-a.z;
      const nx=aby*adz-abz*ady, ny=abz*adx-abx*adz, nz=abx*ady-aby*adx;
      const length=Math.hypot(nx,ny,nz);
      faces.push({a,b,c,d,nx:nx/length,ny:ny/length,nz:nz/length,
        // The two gold rails are opposite sections of a single two-lap path.
        rail: j===0 || j===sides/2, path: (i/rings + (j===0?0:1))/2, depth:0,
        light:0, facing:0});
    }
  }

  function palette(from,to) {
    return Array.from({length:128},(_,i) =>
      'rgb('+from.map((v,k)=>Math.round(v+(to[k]-v)*i/127)).join(',')+')');
  }
  const shellColors=palette([22,34,36],[112,84,40]);
  const wireColors=palette([109,85,51],[255,229,163]);
  const railColors=palette([145,106,49],[255,247,194]);
  const tone=t=>Math.min(127,Math.max(0,Math.round(t*127)));

  // Rotate in depth about an inclined axis, with a small additional bank.
  // Every angle and the two-lap light path are periodic at the same seam.
  let pixelScale=1;
  function draw(seconds) {
    const phase=seconds/period;
    const angle=tau*phase;
    const cy=Math.cos(angle), sy=Math.sin(angle);
    const tilt=.54;
    const ct=Math.cos(tilt), st=Math.sin(tilt);
    const pitch=.24*Math.sin(angle), cp=Math.cos(pitch), sp=Math.sin(pitch);
    const roll=.15*Math.sin(2*angle), cr=Math.cos(roll), sr=Math.sin(roll);
    // Rz(roll) Rx(pitch) Rz(tilt) Ry(angle) Rz(-tilt)
    const ax=ct*ct*cy+st*st, ay=ct*st*(cy-1), az=ct*sy;
    const bx=ay, by=st*st*cy+ct*ct, bz=st*sy;
    const dx=-ct*sy, dy=-st*sy, dz=cy;
    const px=cp*bx-sp*dx, py=cp*by-sp*dy, pz=cp*bz-sp*dz;
    const xx=cr*ax-sr*px, xy=cr*ay-sr*py, xz=cr*az-sr*pz;
    const yx=sr*ax+cr*px, yy=sr*ay+cr*py, yz=sr*az+cr*pz;
    const zx=sp*bx+cp*dx, zy=sp*by+cp*dy, zz=sp*bz+cp*dz;
    for (const p of points) {
      p.sx=width/2 + 137*(xx*p.x+xy*p.y+xz*p.z);
      p.sy=height/2 - 137*(yx*p.x+yy*p.y+yz*p.z);
      p.depth=zx*p.x+zy*p.y+zz*p.z;
    }

    visible.length=0;
    for (const f of faces) {
      const facing=zx*f.nx+zy*f.ny+zz*f.nz;
      if (facing<=0) continue;
      const nx=xx*f.nx+xy*f.ny+xz*f.nz;
      const ny=yx*f.nx+yy*f.ny+yz*f.nz;
      f.light=Math.max(0,-.43*nx+.62*ny+.65*facing);
      f.facing=facing;
      f.depth=(f.a.depth+f.b.depth+f.c.depth+f.d.depth)*.25;
      visible.push(f);
    }
    visible.sort((a,b)=>a.depth-b.depth);
    ctx.setTransform(pixelScale,0,0,pixelScale,0,0);
    ctx.clearRect(0,0,width+1,height+1);
    ctx.lineJoin='round';
    ctx.lineCap='round';
    for (const f of visible) {
      const {a,b,c,d,light}=f;
      const z=Math.min(1,Math.max(0,(f.depth+2)/4));
      const rim=(1-f.facing)**3;
      ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy);
      ctx.lineTo(c.sx,c.sy); ctx.lineTo(d.sx,d.sy); ctx.closePath();
      ctx.fillStyle=shellColors[tone(.08*z+.72*light*light+.1*rim)];
      ctx.fill();
      ctx.strokeStyle=wireColors[tone(.08+.19*z+.63*light+.13*rim)];
      ctx.lineWidth=.62+.28*z;
      ctx.stroke();

      if (f.rail) {
        const distance=(phase-f.path+1)%1;
        const pulse=Math.max(0,1-distance/.092)**2;
        ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy);
        ctx.strokeStyle=railColors[tone(.13+.26*light+.86*pulse)];
        ctx.lineWidth=1.25+1.7*pulse;
        ctx.stroke();
        if (pulse>.93) {
          ctx.beginPath();
          ctx.arc((a.sx+b.sx)/2,(a.sy+b.sy)/2,2.2,0,tau);
          ctx.fillStyle='#fff1bf'; ctx.fill();
        }
      }
    }
  }

  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused=preference.matches, inView=false, elapsed=0, previous=null, tick=0;
  function resize() {
    const rect=stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const fit=Math.min(rect.width/width,rect.height/height);
    const density=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(width*fit*density));
    const h=Math.max(1,Math.round(height*fit*density));
    if (canvas.width!==w || canvas.height!==h || canvas.hidden) {
      canvas.width=w; canvas.height=h; pixelScale=w/width;
      draw(elapsed);
      canvas.hidden=false; poster.hidden=true;
    }
  }
  function animate(now) {
    if (previous===null) previous=now;
    if (now-previous>=1000/30-.5) {
      elapsed=(elapsed+(now-previous)/1000)%period;
      previous=now; draw(elapsed);
    }
    tick=requestAnimationFrame(animate);
  }
  function playback() {
    cancelAnimationFrame(tick);
    previous=null;
    toggle.toggleAttribute('data-paused',paused);
    toggle.title=paused?'播放流形動畫':'暫停流形動畫';
    toggle.setAttribute('aria-label',toggle.title);
    if (!paused && inView && !document.hidden) tick=requestAnimationFrame(animate);
  }
  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize',resize);
  toggle.hidden=false;
  toggle.addEventListener('click',()=>{ paused=!paused; playback(); });
  preference.addEventListener('change',e=>{ paused=e.matches; playback(); });
  document.addEventListener('visibilitychange',playback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry])=>{ inView=entry.isIntersecting; playback(); }).observe(stage);
  } else inView=true;
  playback();
})();
