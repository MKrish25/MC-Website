/* Verbatim port of the original inline module — do not hand-edit. */
export function initBg() {
try{
(function(){
  const cv = document.getElementById('bgCanvas');
  if(!cv || typeof THREE === 'undefined') return;
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
  if(isIOS) return; /* avoid a second concurrent WebGL context on iOS Safari, which can crash the tab */
  let started = false;
  function boot(){
    if(started) return; started = true;
    let renderer;
    try{ renderer = new THREE.WebGLRenderer({canvas:cv, alpha:true, antialias:true, powerPreference:'low-power'}); }catch(e){ return; }
    const small = innerWidth < 700;
    renderer.setPixelRatio(Math.min(devicePixelRatio||1, small ? 1.25 : 1.5));
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, .1, 80);
    function fit(){ renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth/innerHeight; cam.updateProjectionMatrix(); }
    fit();
    const rnd = (a,b)=>a+Math.random()*(b-a);
    const U = {time:{value:0}, focus:{value:14}, tone:{value:1}};

    /* monochrome photographs, painted once */
    const scenes = [
      (g,w,h)=>{ const gr = g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#ececea'); gr.addColorStop(.55,'#b5b5b3'); gr.addColorStop(.56,'#3b3b3a'); gr.addColorStop(1,'#151515'); g.fillStyle = gr; g.fillRect(0,0,w,h); g.fillStyle = '#fff'; g.beginPath(); g.arc(w*.68,h*.32,h*.07,0,7); g.fill(); },
      (g,w,h)=>{ const gr = g.createLinearGradient(0,0,w,h); gr.addColorStop(0,'#e4e4e2'); gr.addColorStop(1,'#6f6f6d'); g.fillStyle = gr; g.fillRect(0,0,w,h); g.fillStyle = '#121212'; g.beginPath(); g.ellipse(w*.5,h*.42,w*.11,h*.15,0,0,7); g.fill(); g.beginPath(); g.ellipse(w*.5,h*1.02,w*.27,h*.34,0,0,7); g.fill(); },
      (g,w,h)=>{ g.fillStyle = '#d9d9d7'; g.fillRect(0,0,w,h); for(let i=0;i<7;i++){ g.fillStyle = i%2 ? '#1c1c1c' : '#8d8d8b'; g.fillRect(w*(.06+i*.135), h*(.15+(i%3)*.08), w*.09, h*.85); } },
      (g,w,h)=>{ g.fillStyle = '#0d0d0d'; g.fillRect(0,0,w,h); const gr = g.createRadialGradient(w*.3,h*.35,2,w*.3,h*.35,w*.5); gr.addColorStop(0,'#f4f4f2'); gr.addColorStop(.25,'#9a9a98'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0,0,w,h); g.fillStyle = '#e6e6e4'; g.fillRect(w*.72,h*.55,w*.02,h*.45); }
    ];
    function ctex(w,h,draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'),w,h); const t = new THREE.CanvasTexture(c); t.premultiplyAlpha = true; t.anisotropy = 2; return t; }
    function paint(g,i,x,y,w,h){ g.save(); g.beginPath(); g.rect(x,y,w,h); g.clip(); g.translate(x,y); scenes[i%4](g,w,h); const v = g.createRadialGradient(w/2,h/2,w*.2,w/2,h/2,w*.75); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,.35)'); g.fillStyle = v; g.fillRect(0,0,w,h); g.restore(); }
    function shadowRect(g,x,y,w,h,col){ g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 22; g.shadowOffsetY = 10; g.fillStyle = col; g.fillRect(x,y,w,h); g.restore(); }
    const printTex = [[0,440,330],[1,330,420],[2,440,330],[3,330,420],[1,440,330],[0,330,420]].map(a=>ctex(512,512,g=>{ const x = (512-a[1])/2, y = (512-a[2])/2 - 6; shadowRect(g,x,y,a[1],a[2],'#fbfbfa'); paint(g,a[0],x+14,y+14,a[1]-28,a[2]-40); }));
    /* vintage film rolls: a coiled spool trailing a strip of sprocketed negatives, frames are black & white member uploads */
    const FW = 266, FX = [176,456,736], FY = 62, FH = 124;
    function paintRoll(g,k,imgs){
      g.clearRect(0,0,1024,256);
      shadowRect(g,10,34,1004,180,'#17120e');
      g.fillStyle = '#efe6d2'; for(let x=170;x<1000;x+=30){ g.fillRect(x,44,12,9); g.fillRect(x,203,12,9); }
      /* spool coil */
      g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 16; g.shadowOffsetY = 6; g.fillStyle = '#0c0a08'; g.beginPath(); g.arc(86,128,84,0,7); g.fill(); g.restore();
      for(let r=80;r>26;r-=5){ g.strokeStyle = r%10===0 ? '#2a2420' : '#1a1512'; g.lineWidth = 2.4; g.beginPath(); g.arc(86,128,r,0,7); g.stroke(); }
      g.fillStyle = '#c9c3b6'; g.beginPath(); g.arc(86,128,22,0,7); g.fill(); g.fillStyle = '#17120e'; g.beginPath(); g.arc(86,128,8,0,7); g.fill();
      for(let f=0;f<3;f++){
        const x = FX[f], im = imgs && imgs[f];
        if(im){
          const r = Math.max(FW/im.width, FH/im.height), dw = im.width*r, dh = im.height*r;
          g.save(); g.beginPath(); g.rect(x,FY,FW,FH); g.clip(); g.drawImage(im, x+(FW-dw)/2, FY+(FH-dh)/2, dw, dh); g.restore();
          /* force true black & white, add contrast and grain */
          try{ const d = g.getImageData(x,FY,FW,FH), px = d.data;
            for(let q=0;q<px.length;q+=4){ let l = .299*px[q]+.587*px[q+1]+.114*px[q+2]; l = (l-128)*1.18+128+(Math.random()-.5)*26; l = l<0?0:l>255?255:l; px[q]=px[q+1]=px[q+2]=l; }
            g.putImageData(d,x,FY); }catch(e){ g.fillStyle = 'rgba(128,128,128,1)'; g.globalCompositeOperation = 'saturation'; g.fillRect(x,FY,FW,FH); g.globalCompositeOperation = 'source-over'; }
        } else paint(g,f+k,x,FY,FW,FH);
        const v = g.createRadialGradient(x+FW/2,FY+FH/2,FW*.2,x+FW/2,FY+FH/2,FW*.62); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,.4)'); g.fillStyle = v; g.fillRect(x,FY,FW,FH);
        g.fillStyle = '#d9a441'; g.font = '10px monospace'; g.fillText('\u25B8 '+(f+1+k*3)+'A   TRI-X 400', x+2, 58);
      }
    }
    const stripTex = [0,1,2,3].map(k=>ctex(1024,256,(g)=>paintRoll(g,k,null)));

    /* shaders: depth-of-field on paper, 9-blade bokeh, light shafts */
    const VS = 'varying vec2 vUv; varying float vDist; uniform float bend, time; void main(){ vUv = uv; vec3 p = position; float u = uv.x-.5; p.z += (u*u*2.-.25)*bend*sin(time*.4+bend*7.); vec4 mv = modelViewMatrix*vec4(p,1.); vDist = -mv.z; gl_Position = projectionMatrix*mv; }';
    const FS = 'uniform sampler2D map; uniform float opacity, focus, blurK, tone; varying vec2 vUv; varying float vDist; void main(){ float coc = clamp(abs(vDist-focus)*blurK,0.,1.); vec4 c = texture2D(map,vUv,coc*5.5); float fade = smoothstep(9.,17.,vDist)*(1.-smoothstep(24.,42.,vDist)); gl_FragColor = vec4(c.rgb*tone,c.a)*(opacity*fade*(1.-coc*.35)); }';
    const BVS = 'varying vec2 vUv; varying float vDist; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.); vDist = -mv.z; gl_Position = projectionMatrix*mv; }';
    const BFS = 'uniform vec3 color; uniform float opacity, time, ph; varying vec2 vUv; varying float vDist; void main(){ vec2 p = vUv*2.-1.; float a = atan(p.y,p.x); float seg = 6.28318/9.; float d = cos(floor(.5+a/seg)*seg-a)*length(p); float edge = smoothstep(1.,.82,d); float rim = smoothstep(.7,.96,d)*edge; float al = edge*(.32+.5*rim)*opacity*(.75+.25*sin(time*.6+ph)); al *= smoothstep(9.,16.,vDist)*(1.-smoothstep(26.,44.,vDist)); gl_FragColor = vec4(color*al,al); }';
    const SVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }';
    const SFS = 'uniform float opacity, time, ph; varying vec2 vUv; void main(){ float ax = pow(1.-abs(vUv.x*2.-1.),2.2); float ay = smoothstep(0.,.25,vUv.y)*(1.-smoothstep(.55,1.,vUv.y)); float a = ax*ay*opacity*(.8+.2*sin(time*.3+ph)); gl_FragColor = vec4(vec3(1.)*a,a); }';
    const shader = (u,v,f)=>new THREE.ShaderMaterial({uniforms:u, vertexShader:v, fragmentShader:f, transparent:true, depthWrite:false, premultipliedAlpha:true, side:THREE.DoubleSide});

    /* studio light shafts at the back */
    [[-9,.16],[-1,.12],[8,.15]].forEach((c,i)=>{
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9+i*2,46), shader({opacity:{value:c[1]}, time:U.time, ph:{value:i*2.1}}, SVS, SFS));
      m.position.set(c[0]*1.6,4,-30-i*3); m.rotation.z = -.5; m.userData.base = -.5; m.userData.i = i; scene.add(m); (scene.userData.shafts = scene.userData.shafts||[]).push(m);
    });

    /* the archive: prints and film strips that drift toward you */
    const items = [], bokeh = [];
    function place(m,first){ const u = m.userData, a = rnd(0,6.283), r = rnd(3.4,9.5) * (u.strip ? 1.15 : 1);
      m.position.set(Math.cos(a)*r*1.3, Math.sin(a)*r*.8, first ? rnd(-42,-10) : -42 - rnd(0,4)); }
    function addPaper(tex,geo,sc,op,strip){
      const m = new THREE.Mesh(geo, shader({map:{value:tex}, opacity:{value:op}, bend:{value:rnd(.05,.2)}, blurK:{value:.085}, focus:U.focus, tone:U.tone, time:U.time}, VS, FS));
      m.scale.setScalar(sc); m.userData = {k:rnd(.8,1.25), ry:rnd(-.12,.12), rz:rnd(-.04,.04), strip:strip};
      m.rotation.set(rnd(-.15,.15), rnd(-.7,.7), strip ? rnd(-.45,.45) : rnd(-.3,.3));
      place(m,true); scene.add(m); items.push(m);
    }
    const sq = new THREE.PlaneGeometry(1,1), st = new THREE.PlaneGeometry(4,1);
    for(let i=0;i<(small?14:30);i++) addPaper(printTex[i%6], sq, rnd(.55,1.05), rnd(.6,.9), false);
    for(let i=0;i<(small?3:6);i++) addPaper(stripTex[i%4], st, rnd(.6,.9), rnd(.55,.75), true);
    const bg = new THREE.PlaneGeometry(1,1);
    for(let i=0;i<(small?12:26);i++){
      const m = new THREE.Mesh(bg, shader({color:{value:new THREE.Color(i%5===0?0xfff0d6:0xffffff)}, opacity:{value:rnd(.5,.95)}, time:U.time, ph:{value:rnd(0,6.3)}}, BVS, BFS));
      const sc = rnd(.25,.9); m.scale.set(sc,sc,1); m.rotation.z = rnd(0,6.3); m.userData = {k:rnd(1.1,1.7), strip:false}; place(m,true); scene.add(m); bokeh.push(m);
    }

    /* dust in the light */
    const dn = small ? 70 : 150, dpos = new Float32Array(dn*3);
    for(let i=0;i<dn;i++){ dpos[i*3] = rnd(-14,14); dpos[i*3+1] = rnd(-9,9); dpos[i*3+2] = rnd(-16,-2); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dpos,3));
    const dot = ctex(32,32,(g,w,h)=>{ const r = g.createRadialGradient(16,16,0,16,16,16); r.addColorStop(0,'rgba(255,255,255,1)'); r.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0,0,32,32); });
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({size:.16, map:dot, transparent:true, opacity:.8, depthWrite:false, color:0xffffff})); scene.add(dust);

    const camFocus = 0, camSpeed = 1;

    /* cursor parallax; scrolling speeds up the flight */
    let mx = 0, my = 0, cx = 0, cy = 0, lastSY = scrollY, boost = 0;
    addEventListener('pointermove', e=>{ mx = e.clientX/innerWidth - .5; my = e.clientY/innerHeight - .5; }, {passive:true});
    addEventListener('scroll', ()=>{ boost = Math.min(5, boost + Math.abs(scrollY-lastSY)*.02); lastSY = scrollY; }, {passive:true});
    const pDims = [[440,330],[330,420],[440,330],[330,420],[440,330],[330,420]];
    window.__bgPhotos = function(srcs){ printTex.forEach((tx,k)=>{ const src = srcs[k%srcs.length]; if(!src) return; const im = new Image();
      im.onload = ()=>{ const g = tx.image.getContext('2d'), w = pDims[k][0], h = pDims[k][1], x = (512-w)/2, y = (512-h)/2-6, bw = w-28, bh = h-40, r = Math.max(bw/im.width, bh/im.height);
        g.clearRect(0,0,512,512); shadowRect(g,x,y,w,h,'#fbfbfa'); g.save(); g.beginPath(); g.rect(x+14,y+14,bw,bh); g.clip();
        g.drawImage(im, x+14+(bw-im.width*r)/2, y+14+(bh-im.height*r)/2, im.width*r, im.height*r); g.restore(); tx.needsUpdate = true; if(still) draw(0,8); };
      im.src = src; }); };
    if(window.__realSrcs && window.__realSrcs.length) window.__bgPhotos(window.__realSrcs);
    window.__bgFilm = function(srcs){ if(!srcs || !srcs.length) return;
      stripTex.forEach((tx,k)=>{ const picks = [0,1,2].map(f=>srcs[(k*3+f)%srcs.length]); let n = 0; const imgs = [];
        picks.forEach((src,f)=>{ const im = new Image(); im.onload = im.onerror = ()=>{ imgs[f] = im.width ? im : null; if(++n===3){ paintRoll(tx.image.getContext('2d'),k,imgs); tx.needsUpdate = true; if(still) draw(0,8); } }; im.src = src; }); }); };
    if(window.__memberSrcs && window.__memberSrcs.length) window.__bgFilm(window.__memberSrcs);
    window.__bgSurge = function(){ boost = Math.min(5, boost + 2.2); };
    addEventListener('resize', ()=>{ fit(); if(still) draw(0,8); });

    function draw(dt,t){
      U.time.value = t;
      U.focus.value = 14 + 8*Math.sin(t*.12) + .8*Math.sin(t*1.1) + camFocus;   /* rack focus, with a little focus hunting */
      boost *= Math.pow(.05,dt); const sp = 1.1*(1+boost)*camSpeed;
      for(const m of items){ const u = m.userData; m.position.z += sp*u.k*dt; m.rotation.y += u.ry*dt; m.rotation.z += u.rz*dt; if(m.position.z > -9) place(m,false); }
      for(const m of bokeh){ m.position.z += sp*m.userData.k*dt; m.position.y += .12*dt; if(m.position.z > -9) place(m,false); }
      const dp = dg.attributes.position; for(let i=0;i<dn;i++){ let y = dp.getY(i) + .18*dt; if(y > 9) y = -9; dp.setY(i,y); dp.setX(i, dp.getX(i) + Math.sin(t*.3+i)*.002); } dp.needsUpdate = true;
      (scene.userData.shafts||[]).forEach(m=>{ m.rotation.z = m.userData.base + .05*Math.sin(t*.1+m.userData.i*1.7); });
      cx += (mx - cx)*.04; cy += (my - cy)*.04;
      cam.rotation.set(-cy*.06, -cx*.1, 0); cam.position.set(cx*.8, -cy*.5, 0);
      renderer.render(scene, cam);
    }
    window.__bgTheme = function(dark){
      U.tone.value = dark ? .5 : 1;
      if(still) draw(0,8);
    };
    window.__bgTheme(document.documentElement.dataset.theme === 'dark');
    if(still){ draw(0,8); return; }
    const studio = document.getElementById('studioPage');
    let last = performance.now(), t = 0;
    (function loop(now){
      const dt = Math.min(.05,(now-last)/1000); last = now; t += dt;
      if(!(studio && studio.classList.contains('visible'))) draw(dt,t);
      requestAnimationFrame(loop);
    })(last);
  }
  const wait = setInterval(()=>{ if(!document.getElementById('loader')){ clearInterval(wait); boot(); } }, 150);
  setTimeout(()=>{ clearInterval(wait); boot(); }, 6000);
})();
}catch(e){ console.error("module error:", e); }
}
