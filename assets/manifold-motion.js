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
  const rings = 112;
  const sides = 40;
  const points = [];
  const patches = [];
  const clamp = value => Math.max(0, Math.min(1, value));

  // An orthonormal frame keeps the tube circular even on steep bends.
  // The longitudinal grid rotates half a turn before the two ends meet.
  function surface(u, v, radialFraction=1) {
    const cu=Math.cos(u), su=Math.sin(u);
    const major=1.35+.155*Math.cos(3*u+.4);
    const radius=radialFraction*(.605+.035*Math.sin(2*u-.45));
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

  // Each entry mixes gold wire with a translucent navy cell. Precomputing
  // coverage keeps thin lines antialiased without blending hidden back faces.
  const toneCount = 64;
  const coverageCount = 128;
  const wirePalette = new Uint32Array(toneCount * coverageCount);
  // Sampled from the polished gold reference: amber, body gold and glints.
  const goldStops = [[151,90,8], [188,119,19], [220,155,35], [241,186,62],
                     [249,204,86], [253,217,110], [255,225,132], [255,247,200]];
  for (let tone = 0; tone < toneCount; tone++) {
    const light = tone / (toneCount - 1);
    const position = light * (goldStops.length - 1);
    const left = Math.min(goldStops.length - 2, Math.floor(position));
    const color = goldStops[left].map((channel, i) =>
      channel + (goldStops[left + 1][i] - channel) * (position - left));
    const cell = [10 + 3 * light, 30 + 11 * light, 41 + 12 * light];
    const cellAlpha = .46;
    for (let level = 0; level < coverageCount; level++) {
      const coverage = level / (coverageCount - 1);
      const background = cellAlpha * (1 - coverage);
      const alpha = coverage + background;
      const [r, g, b] = color.map((channel, i) =>
        Math.round((channel * coverage + cell[i] * background) / alpha));
      wirePalette[tone * coverageCount + level] = (Math.round(255 * alpha) << 24) |
        (b << 16) | (g << 8) | r;
    }
  }

  // Reflections move over the mesh as its normals rotate relative to the lights.
  const texSize=256;
  const studio=new Uint8Array(texSize*texSize);
  const stripReflection=new Uint8Array(texSize*texSize);
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
      stripReflection[j*texSize+i]=Math.round(255*Math.max(upperStrip,.92*leftStrip,.83*rightStrip));
    }
  }

  let pixelScale=1, image, pixels, depths, emission;
  // Produce optical bloom from visible, illuminated strands. The mask is
  // downsampled before blurring to keep the animation inexpensive on phones.
  const bloomCanvas=document.createElement('canvas');
  const bloomContext=bloomCanvas.getContext('2d');
  const bloomStep=6;
  let bloomImage, bloomPixels, sourceLight, blurX, nearLight, farLight;
  function resizeBloom(w,h) {
    bloomCanvas.width=Math.ceil(w/bloomStep);
    bloomCanvas.height=Math.ceil(h/bloomStep);
    bloomImage=bloomContext.createImageData(bloomCanvas.width,bloomCanvas.height);
    bloomPixels=new Uint32Array(bloomImage.data.buffer);
    sourceLight=new Float32Array(bloomPixels.length);
    blurX=new Float32Array(bloomPixels.length);
    nearLight=new Float32Array(bloomPixels.length);
    farLight=new Float32Array(bloomPixels.length);
  }
  function blurLight(input,output,stride) {
    const w=bloomCanvas.width, h=bloomCanvas.height;
    for(let y=0;y<h;y++) {
      const row=y*w;
      for(let x=0;x<w;x++) {
        const k=row+x;
        blurX[k]=(input[k]*6+
          4*(input[row+Math.max(0,x-stride)]+input[row+Math.min(w-1,x+stride)])+
          input[row+Math.max(0,x-2*stride)]+input[row+Math.min(w-1,x+2*stride)])/16;
      }
    }
    for(let y=0;y<h;y++) {
      const top=Math.max(0,y-stride)*w, bottom=Math.min(h-1,y+stride)*w;
      const farTop=Math.max(0,y-2*stride)*w, farBottom=Math.min(h-1,y+2*stride)*w;
      for(let x=0,k=y*w;x<w;x++,k++) {
        output[k]=(blurX[k]*6+4*(blurX[top+x]+blurX[bottom+x])+blurX[farTop+x]+blurX[farBottom+x])/16;
      }
    }
  }
  function compositeBloom() {
    const w=canvas.width, h=canvas.height, bw=bloomCanvas.width;
    sourceLight.fill(0);
    for(let y=0;y<h;y++) {
      const row=Math.floor(y/bloomStep)*bw;
      for(let tile=0;tile<bw;tile++) {
        const x0=tile*bloomStep, stop=y*w+Math.min(w,x0+bloomStep);
        let sum=0;
        for(let k=y*w+x0;k<stop;k++) sum+=emission[k];
        sourceLight[row+tile]+=sum/(bloomStep*bloomStep);
      }
    }
    blurLight(sourceLight,nearLight,1);
    blurLight(nearLight,farLight,2);
    for(let k=0;k<bloomPixels.length;k++) {
      const intensity=clamp((nearLight[k]*2.0+farLight[k]*1.08)/255);
      bloomPixels[k]=(Math.round(230*intensity)<<24)|(48<<16)|(178<<8)|255;
    }
    bloomContext.putImageData(bloomImage,0,0);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.drawImage(bloomCanvas,0,0,bw*bloomStep,bloomCanvas.height*bloomStep);
    ctx.restore();
  }
  // Shade only the nearest surface so the far side does not clutter the mesh.
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
    const uStep=second ? Math.hypot(db,eb) : Math.hypot(da,ea);
    const vStep=second ? Math.hypot(da,ea) : Math.hypot(da+db,ea+eb);
    const uPixels=1/Math.max(.0001,uStep), vPixels=1/Math.max(.0001,vStep);
    const halfWidth=Math.max(.78,1.22*pixelScale);
    const haloWidth=2.5*halfWidth;
    const uFacing=(second ? -.55*db-.83*eb : .55*da+.83*ea)*uPixels;
    const vFacing=(second ? .55*da+.83*ea : .55*(da+db)+.83*(ea+eb))*vPixels;
    // Narrow the apparent line at grazing angles before cells overlap.
    const uWeight=.30+.70*clamp(uPixels/2.5);
    const vWeight=.30+.70*clamp(vPixels/2.5);
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
        const u=second?wb:1-wa, v=second?1-wa:wc;
        const du=(ix%2?1-u:u)*uPixels, dv=(iy%2?1-v:v)*vPixels;
        const ringCoverage=clamp(halfWidth+.5-du)*uWeight;
        const meridianCoverage=clamp(halfWidth+.5-dv)*vWeight;
        const core=Math.max(ringCoverage,meridianCoverage);
        const halo=Math.max(clamp(1-du/haloWidth)*uWeight,clamp(1-dv/haloWidth)*vWeight);
        const railIndex=iy%(sides/2);
        const rail=railIndex===0 || railIndex===sides/2-1;
        const glint=rail && meridianCoverage>ringCoverage ? .18*pulse : 0;
        const tx=Math.round(clamp((nx+1)*.5)*(texSize-1));
        const ty=Math.round(clamp((ny+1)*.5)*(texSize-1));
        const reflection=studio[ty*texSize+tx]/255;
        // A tiny bevel rolls the highlight across each strand. Use the projected
        // gradient to keep its lit edge facing the same light on both axes.
        const alongRing=ringCoverage>=meridianCoverage;
        const across=alongRing ? (ix%2 ? -du : du) : (iy%2 ? -dv : dv);
        const bevel=clamp(.5+.5*across*(alongRing?uFacing:vFacing)/halfWidth);
        const filament=clamp(1-Math.abs(bevel-.68)/.26);
        const band=stripReflection[ty*texSize+tx]/255;
        const highlight=clamp((reflection-.55)/.43);
        const base=.17+.51*reflection+.12*bevel+.028*z+filament*highlight*highlight*.27+glint*.40;
        const specular=band*band*(.62+.38*filament);
        const light=clamp(base+.66*specular);
        emission[k]=Math.round(255*clamp((.11+.89*band*band)*core+.18*specular*halo));
        // A bright filament and a narrow gold halo leave the navy gaps open.
        const coverage=core+(1-core)*halo*halo*(.35+.60*reflection);
        const tone=Math.round(light*(toneCount-1));
        pixels[k]=wirePalette[tone*coverageCount+Math.round(coverage*(coverageCount-1))];
      }
    }
  }

  // The seven lanes share the mesh's centreline and stay inside its wall.
  const meteors = [
    {start:.025, turns:1, lane:.26, spread:.48, tail:.56},
    {start:.171, turns:-1, lane:2.3, spread:.38, tail:.49},
    {start:.315, turns:1, lane:4.8, spread:.55, tail:.58},
    {start:.456, turns:2, lane:1.4, spread:.44, tail:.63},
    {start:.607, turns:1, lane:3.6, spread:.33, tail:.47},
    {start:.751, turns:-1, lane:5.4, spread:.50, tail:.55},
    {start:.879, turns:1, lane:2.8, spread:.46, tail:.52}
  ];
  let meteorLight;
  const illuminated = [];
  const tailSteps = 18;
  function meteorPosition(meteor,u,camera) {
    // Cancel the wall's half-twist so each interior path joins after one turn.
    const lane=meteor.lane+.85*Math.sin(2*u+meteor.lane)-u*.5;
    const p=surface(u,lane,meteor.spread);
    const depth=camera.zx*p.x+camera.zy*p.y+camera.zz*p.z;
    const scale=130*pixelScale/(1-depth/13);
    return {
      x:width*pixelScale*.5+scale*(camera.xx*p.x+camera.xy*p.y+camera.xz*p.z),
      y:height*pixelScale*.5-scale*(camera.yx*p.x+camera.yy*p.y+camera.yz*p.z),
      depth, scale:scale/130
    };
  }
  function lightMeteorPixel(k,z,brightness) {
    const separation=depths[k]-z;
    if(separation<0) return;
    // Opaque wires hide the meteor. The far bend also dims it at crossings.
    const transmission=(255-(pixels[k]>>>24))/138;
    const strength=Math.round(255*clamp(brightness*transmission/(1+.55*Math.max(0,separation-.8))));
    if(strength<=meteorLight[k]) return;
    if(!meteorLight[k]) illuminated.push(k);
    meteorLight[k]=strength;
  }
  function meteorSegment(a,b,fraction) {
    const dx=b.x-a.x, dy=b.y-a.y, lengthSq=dx*dx+dy*dy;
    const radius=(.65+2.7*fraction)*b.scale;
    const reach=3.6*radius, w=canvas.width;
    for(let y=Math.max(0,Math.floor(Math.min(a.y,b.y)-reach));y<=Math.min(canvas.height-1,Math.ceil(Math.max(a.y,b.y)+reach));y++) {
      for(let x=Math.max(0,Math.floor(Math.min(a.x,b.x)-reach));x<=Math.min(w-1,Math.ceil(Math.max(a.x,b.x)+reach));x++) {
        const px=x+.5-a.x, py=y+.5-a.y;
        const t=clamp((px*dx+py*dy)/Math.max(.001,lengthSq));
        const d2=((px-t*dx)**2+(py-t*dy)**2)/(radius*radius);
        if(d2>12) continue;
        const body=1/(1+3*d2*d2), glow=.28/(1+d2);
        lightMeteorPixel(y*w+x,a.depth+t*(b.depth-a.depth),fraction**1.18*(body+glow));
      }
    }
  }
  function meteorHead(p) {
    const w=canvas.width, reach=Math.ceil(12*p.scale);
    for(let y=Math.max(0,Math.floor(p.y-reach));y<=Math.min(canvas.height-1,p.y+reach);y++) {
      for(let x=Math.max(0,Math.floor(p.x-reach));x<=Math.min(w-1,p.x+reach);x++) {
        const dx=(x+.5-p.x)/p.scale, dy=(y+.5-p.y)/p.scale;
        const r2=dx*dx+dy*dy;
        const core=1.55/(1+(r2/14)**2);
        const glint=.65*clamp(1-Math.abs(dx+.32*dy)/1.5)*clamp(1-Math.abs(dy)/11);
        lightMeteorPixel(y*w+x,p.depth,core+glint+.42/(1+r2/30));
      }
    }
  }
  function drawMeteors(phase,camera) {
    for(const meteor of meteors) {
      const u=tau*(meteor.start+phase*meteor.turns);
      const tail=Math.sign(meteor.turns)*meteor.tail;
      let previous=meteorPosition(meteor,u-tail,camera);
      for(let step=1;step<=tailSteps;step++) {
        const fraction=step/tailSteps;
        const next=meteorPosition(meteor,u-tail*(1-fraction),camera);
        meteorSegment(previous,next,fraction);
        previous=next;
      }
      meteorHead(previous);
    }
    for(const k of illuminated) {
      const intensity=meteorLight[k]/255;
      const old=pixels[k], alpha=(old>>>24)/255;
      const outputAlpha=intensity+alpha*(1-intensity);
      const oldWeight=alpha*(1-intensity)/outputAlpha, weight=intensity/outputAlpha;
      const r=Math.round((old&255)*oldWeight+255*weight);
      const g=Math.round(((old>>>8)&255)*oldWeight+(155+100*intensity)*weight);
      const b=Math.round(((old>>>16)&255)*oldWeight+(20+212*intensity**3)*weight);
      pixels[k]=(Math.round(255*outputAlpha)<<24)|(b<<16)|(g<<8)|r;
      emission[k]=Math.max(emission[k],meteorLight[k]);
      meteorLight[k]=0;
    }
    illuminated.length=0;
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
    pixels.fill(0); depths.fill(-Infinity); emission.fill(0);
    for(const patch of patches) {
      const {a,b,c,d,i,j}=patch;
      const path=(i/rings+(j>=sides/2-1&&j<sides-1?1:0))*.5;
      const pulse=clamp(1-((phase-path+1)%1)/.075)**2;
      triangle(a,b,c,patch,false,pulse);
      triangle(a,c,d,patch,true,pulse);
    }
    drawMeteors(phase,{xx,xy,xz,yx,yy,yz,zx,zy,zz});
    ctx.putImageData(image,0,0);
    compositeBloom();
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
      emission=new Uint8Array(w*h);
      meteorLight=new Uint8Array(w*h);
      resizeBloom(w,h);
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
