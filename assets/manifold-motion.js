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
  const rings = 88;
  const sides = 32;
  const points = [];
  const patches = [];
  const clamp = value => Math.max(0, Math.min(1, value));

  // An orthonormal frame keeps the tube circular even on steep bends.
  // The longitudinal grid rotates half a turn before the two ends meet.
  function surface(u, v) {
    const cu=Math.cos(u), su=Math.sin(u);
    const major=1.35+.155*Math.cos(3*u+.4);
    const radius=.605+.035*Math.sin(2*u-.45);
    const majorSlope=-.465*Math.sin(3*u+.4);
    const tx=majorSlope*cu-major*su, ty=majorSlope*su+major*cu;
    const tz=.99*Math.cos(2*u+.6);
    const horizontal=Math.hypot(tx,ty), speed=Math.hypot(horizontal,tz);
    const ax=ty/horizontal, ay=-tx/horizontal;
    const bx=ay*tz/speed, by=-ax*tz/speed, bz=horizontal/speed;
    const twist=u/2+.32;
    const wide=1.025*radius*Math.cos(v), deep=.985*radius*Math.sin(v);
    const radial=wide*Math.cos(twist)-deep*Math.sin(twist);
    const vertical=wide*Math.sin(twist)+deep*Math.cos(twist);
    const x=major*cu+radial*ax+vertical*bx;
    const y=major*su+radial*ay+vertical*by;
    const z=.495*Math.sin(2*u+.6)+vertical*bz;
    const tiltedY=.67*y-.742*z;
    return {x:.91*x-.415*tiltedY,y:.415*x+.91*tiltedY,z:.742*y+.67*z};
  }

  function at(i,j) {
    // Opposite sides of the cross-section coincide at the half-twist seam.
    const offset=i<0 || i>=rings ? sides/2 : 0;
    return points[((i+rings)%rings)*sides+(j+offset+sides)%sides];
  }
  for (let i=0;i<rings;i++) {
    for (let j=0;j<sides;j++) points.push(surface(tau*i/rings,tau*j/sides));
  }
  for (let i=0;i<rings;i++) {
    for (let j=0;j<sides;j++) {
      const a=at(i,j), b=at(i+1,j), c=at(i+1,j+1), d=at(i,j+1);
      const back=at(i-1,j), down=at(i,j-1);
      const ux=b.x-back.x, uy=b.y-back.y, uz=b.z-back.z;
      const vx=d.x-down.x, vy=d.y-down.y, vz=d.z-down.z;
      const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      const length=Math.hypot(nx,ny,nz);
      Object.assign(a,{nx:nx/length,ny:ny/length,nz:nz/length});
      patches.push({a,b,c,d,i,j});
    }
  }

  // Precompute the reflections of a warm studio on polished yellow gold.
  const ramp=[[57,29,5],[111,60,8],[170,101,13],[214,145,27],
              [241,184,55],[255,213,100],[255,236,158],[255,250,217]];
  const gold=new Uint32Array(256);
  for (let i=0;i<256;i++) {
    const pos=i/255*(ramp.length-1), lo=Math.min(ramp.length-2,Math.floor(pos));
    const t=pos-lo;
    const rgb=ramp[lo].map((x,k)=>Math.round(x+(ramp[lo+1][k]-x)*t));
    gold[i]=(255<<24)|(rgb[2]<<16)|(rgb[1]<<8)|rgb[0];
  }
  const texSize=256;
  const studio=new Uint8Array(texSize*texSize);
  for (let j=0;j<texSize;j++) {
    for (let i=0;i<texSize;i++) {
      let x=2*i/(texSize-1)-1, y=2*j/(texSize-1)-1;
      const h=Math.hypot(x,y);
      if(h>1) { x/=h; y/=h; }
      const z=Math.sqrt(Math.max(0,1-x*x-y*y));
      const rx=2*z*x, ry=2*z*y, rz=2*z*z-1;
      const key=clamp(-.40*x+.68*y+.60*z);
      const upperStrip=Math.exp(-1*((ry-.58+.20*rx)/.24)**2);
      const leftStrip=Math.exp(-1*((rx+.76-.20*ry)/.21)**2);
      const rightStrip=Math.exp(-1*((rx-.67+.13*ry)/.12)**2);
      const flag=Math.exp(-1*((ry+.34+.23*rx)/.23)**2);
      const sheen=.36+.25*key+.11*y+.055*rz+.12*(1-z)**2+
        .28*upperStrip+.27*leftStrip+.20*rightStrip-.22*flag;
      studio[j*texSize+i]=Math.round(255*clamp(sheen));
    }
  }

  let pixelScale=1, image, pixels, depths;
  // Interpolate smooth normals per pixel. The fine grid is etched into the
  // same curved surface, so the reflection remains continuous across a cell.
  function triangle(a,b,c,patch,second,pulse) {
    const w=canvas.width, h=canvas.height;
    const area=(b.sy-c.sy)*(a.sx-c.sx)+(c.sx-b.sx)*(a.sy-c.sy);
    if(area>=-.0001) return;
    const x0=Math.max(0,Math.ceil(Math.min(a.sx,b.sx,c.sx)-.5));
    const x1=Math.min(w-1,Math.floor(Math.max(a.sx,b.sx,c.sx)-.5));
    const y0=Math.max(0,Math.ceil(Math.min(a.sy,b.sy,c.sy)-.5));
    const y1=Math.min(h-1,Math.floor(Math.max(a.sy,b.sy,c.sy)-.5));
    const da=(b.sy-c.sy)/area, db=(c.sy-a.sy)/area;
    const ea=(c.sx-b.sx)/area, eb=(a.sx-c.sx)/area;
    const ix=patch.i, iy=patch.j;
    const m=texSize-1;
    const uStep=second ? Math.hypot(db,eb) : Math.hypot(da,ea);
    const vStep=second ? Math.hypot(da,ea) : Math.hypot(da+db,ea+eb);
    const uWidth=Math.max(.001,uStep*pixelScale);
    const vWidth=Math.max(.001,vStep*pixelScale);
    for(let y=y0;y<=y1;y++) {
      let wa=da*(x0+.5-c.sx)+ea*(y+.5-c.sy);
      let wb=db*(x0+.5-c.sx)+eb*(y+.5-c.sy);
      for(let x=x0,k=y*w+x;x<=x1;x++,k++,wa+=da,wb+=db) {
        const wc=1-wa-wb;
        if(wa<-.00001 || wb<-.00001 || wc<-.00001) continue;
        const z=wa*a.depth+wb*b.depth+wc*c.depth;
        if(z<=depths[k]) continue;
        depths[k]=z;
        const nx=wa*a.viewX+wb*b.viewX+wc*c.viewX;
        const ny=wa*a.viewY+wb*b.viewY+wc*c.viewY;
        const tx=Math.min(m,Math.max(0,Math.round((nx+1)*m*.5)));
        const ty=Math.min(m,Math.max(0,Math.round((ny+1)*m*.5)));
        const u=second?wb:1-wa, v=second?1-wa:wc;
        // Mesh intervals of two cells give the specular bands room to read.
        const du=ix%2 ? 1-u : u, dv=iy%2 ? 1-v : v;
        const line=clamp(1.05-Math.min(du/uWidth,dv/vWidth));
        const mark=iy%(sides/2);
        const distance=mark===0?v:mark===sides/2-1?1-v:2;
        const rail=clamp(1.6-distance/vWidth);
        const shade=studio[ty*texSize+tx]+8*z+line*19+rail*(12+70*pulse);
        pixels[k]=gold[Math.min(255,Math.max(0,Math.round(shade)))];
      }
    }
  }

  function draw(seconds) {
    const phase=seconds/period, angle=tau*phase;
    const cy=Math.cos(angle), sy=Math.sin(angle);
    const ct=Math.cos(.54), st=Math.sin(.54);
    const pitch=.24*Math.sin(angle), cp=Math.cos(pitch), sp=Math.sin(pitch);
    const bank=.15*Math.sin(2*angle), cr=Math.cos(bank), sr=Math.sin(bank);
    const ax=ct*ct*cy+st*st, ay=ct*st*(cy-1), az=ct*sy;
    const bx=ay, by=st*st*cy+ct*ct, bz=st*sy;
    const dx=-ct*sy, dy=-st*sy, dz=cy;
    const px=cp*bx-sp*dx, py=cp*by-sp*dy, pz=cp*bz-sp*dz;
    const xx=cr*ax-sr*px, xy=cr*ay-sr*py, xz=cr*az-sr*pz;
    const yx=sr*ax+cr*px, yy=sr*ay+cr*py, yz=sr*az+cr*pz;
    const zx=sp*bx+cp*dx, zy=sp*by+cp*dy, zz=sp*bz+cp*dz;
    for(const p of points) {
      p.depth=zx*p.x+zy*p.y+zz*p.z;
      const perspective=130/(1-p.depth/13);
      p.sx=pixelScale*(width/2+perspective*(xx*p.x+xy*p.y+xz*p.z));
      p.sy=pixelScale*(height/2-perspective*(yx*p.x+yy*p.y+yz*p.z));
      p.viewX=xx*p.nx+xy*p.ny+xz*p.nz;
      p.viewY=yx*p.nx+yy*p.ny+yz*p.nz;
    }
    pixels.fill(0); depths.fill(-Infinity);
    for(const patch of patches) {
      const {a,b,c,d,i,j}=patch;
      const path=(i/rings+(j>=sides/2-1&&j<sides-1?1:0))*.5;
      const pulse=clamp(1-((phase-path+1)%1)/.075)**2;
      triangle(a,b,c,patch,false,pulse);
      triangle(a,c,d,patch,true,pulse);
    }
    ctx.putImageData(image,0,0);
  }

  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused=preference.matches, inView=false, elapsed=0, previous=null, tick=0;
  function resize() {
    const rect=stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const fit=Math.min(rect.width/width,rect.height/height);
    const density=Math.min(Math.max(window.devicePixelRatio || 1, 1.35), 2, 1.15 / fit);
    const w=Math.max(1,Math.round(width*fit*density));
    const h=Math.max(1,Math.round(height*fit*density));
    if (canvas.width!==w || canvas.height!==h || canvas.hidden) {
      canvas.width=w; canvas.height=h;
      image=ctx.createImageData(w,h);
      pixels=new Uint32Array(image.data.buffer);
      depths=new Float32Array(w*h);
      pixelScale=w/width;
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
