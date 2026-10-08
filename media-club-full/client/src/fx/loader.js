/* Verbatim port of the original inline module — do not hand-edit. */
export function initLoader() {
try{
(function(){
  const loaderEl = document.getElementById('loader'), flashEl = document.getElementById('loaderFlash'), markEl = document.getElementById('loaderMark');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isIOS = /iP(hone|od|ad)/.test(navigator.platform) || (navigator.userAgent.includes('Mac') && 'ontouchend' in document);
  const isSmallTouch = window.matchMedia && window.matchMedia('(pointer:coarse)').matches && Math.min(window.innerWidth,window.innerHeight) < 900;
  const skipHeavy3D = reduced || isIOS || isSmallTouch;
  let done = false;
  function end(quick){
    if(done) return; done = true; clearTimeout(safety);
    if(quick){
      document.body.classList.remove('loading'); loaderEl.classList.add('hide');
      setTimeout(()=>{ loaderEl.remove(); flashEl.remove(); }, 650); return;
    }
    // shutter: a brief dip to black, then an overexposed frame that dissolves into the site
    flashEl.style.transition = 'opacity 60ms linear'; flashEl.style.background = '#000'; flashEl.style.opacity = '.14';
    setTimeout(()=>{ flashEl.style.background = '#fff'; flashEl.style.transition = 'opacity 80ms linear'; flashEl.style.opacity = '1'; }, 70);
    setTimeout(()=>{ loaderEl.style.display = 'none'; document.body.classList.remove('loading'); flashEl.style.transition = 'opacity .6s ease'; flashEl.style.opacity = '0'; }, 170);
    setTimeout(()=>{ loaderEl.remove(); flashEl.remove(); }, 850);
  }
  const safety = setTimeout(()=>end(true), 4500);
  if(skipHeavy3D || typeof THREE === 'undefined'){ markEl.classList.add('on'); setTimeout(()=>end(true), reduced ? 250 : 550); return; }
  let renderer;
  try{ renderer = new THREE.WebGLRenderer({canvas:document.getElementById('loaderCanvas'), alpha:true, antialias:true}); }
  catch(err){ markEl.classList.add('on'); setTimeout(()=>end(true), 700); return; }
  try{
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    const cv = renderer.domElement; renderer.setSize(cv.clientWidth||260, cv.clientWidth||260, false);
    const scene = new THREE.Scene();
    const vc = new THREE.PerspectiveCamera(24, 1, .1, 100); vc.position.set(0, 4.6, 21); vc.lookAt(0, .05, .4);

    /* studio environment: softboxes and strips give the metal and glass something to reflect */
    const envS = new THREE.Scene();
    envS.add(new THREE.Mesh(new THREE.BoxGeometry(30,30,30), new THREE.MeshBasicMaterial({color:0x2c2c30, side:THREE.BackSide})));
    function panel(w,h,x,y,z,l){ const m = new THREE.Mesh(new THREE.PlaneGeometry(w,h), new THREE.MeshBasicMaterial({color:new THREE.Color(l,l,l), side:THREE.DoubleSide})); m.position.set(x,y,z); m.lookAt(0,0,0); envS.add(m); }
    panel(14,9,-6,12,8,9); panel(2.5,14,12,3,5,6); panel(2.5,12,-13,2,-2,3); panel(10,3,0,6,-13,4); panel(14,10,9,-2,-9,.02); panel(20,4,0,-13,6,.8);
    const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envS, .03).texture; pm.dispose();
    const key = new THREE.DirectionalLight(0xfff6ea, 1.4); key.position.set(-5,9,8); scene.add(key);
    const fill = new THREE.DirectionalLight(0xdfe8ff, .35); fill.position.set(7,2,6); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, .7); rim.position.set(4,5,-8); scene.add(rim);

    /* soft studio shadow, tightens as the camera comes together */
    function blob(a){ const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64,64,0,64,64,64);
      gr.addColorStop(0,'rgba(0,0,0,'+a+')'); gr.addColorStop(.55,'rgba(0,0,0,'+(a*.35)+')'); gr.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0,0,128,128); return new THREE.CanvasTexture(c); }
    const mkSh = (a)=>{ const m = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshBasicMaterial({map:blob(a), transparent:true, depthWrite:false})); m.rotation.x = -Math.PI/2; m.position.set(-.3,-.9,.3); scene.add(m); return m; };
    const shSoft = mkSh(.5), shTight = mkSh(.85);

    /* materials */
    function rib(n){ const c = document.createElement('canvas'); c.width = 64; c.height = 4; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0,0,64,4); g.fillStyle = '#fff'; g.fillRect(0,0,40,4);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(n,1); return t; }
    function dimple(){ const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0,0,128,128);
      for(let i=0;i<420;i++){ g.fillStyle = Math.random()>.5 ? '#bbb' : '#333'; g.beginPath(); g.arc(Math.random()*128, Math.random()*128, 1.6, 0, 6.3); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3,4); return t; }
    const C = (c,r,m,x)=>new THREE.MeshStandardMaterial(Object.assign({color:c, roughness:r, metalness:m}, x||{}));
    const body = C(0x111214,.55,.2), alloy = C(0x33363b,.36,.75), chrome = C(0xd2d5da,.16,1), satin = C(0x2b2c30,.42,.85,{side:THREE.DoubleSide});
    const rubber = C(0x0a0a0b,.92,0,{bumpMap:dimple(), bumpScale:.18}), ribB = C(0x121213,.7,.25,{bumpMap:rib(72), bumpScale:1.1});
    const ribM = C(0x3a3c40,.38,.8,{bumpMap:rib(110), bumpScale:.7, side:THREE.DoubleSide}), dialM = C(0x2f3136,.4,.8,{bumpMap:rib(48), bumpScale:.9});
    const blk = C(0x08080a,.5,.1,{side:THREE.DoubleSide}), redM = C(0x8c1219,.5,.05), white = C(0xe8e8e6,.6,0), coat = C(0x1a1240,.12,.35,{envMapIntensity:1.6}), blade = C(0x1a1a1e,.4,.6);
    const glassM = new THREE.MeshPhysicalMaterial({color:0x06090f, roughness:.03, metalness:.2, clearcoat:1, clearcoatRoughness:.02, transparent:true, opacity:.62, envMapIntensity:2.2});
    const lcdM = new THREE.MeshPhysicalMaterial({color:0x050506, roughness:.15, metalness:.3, clearcoat:1});

    /* geometry helpers */
    function rr(w,h,r){ const s = new THREE.Shape(), x = -w/2, y = -h/2;
      s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r); s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r); s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s; }
    function slab(w,h,d,r,b,m){ const g = new THREE.ExtrudeGeometry(rr(w-2*b,h-2*b,r), {depth:d-2*b, bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments:3, curveSegments:8}); g.translate(0,0,-(d-2*b)/2); return new THREE.Mesh(g,m); }
    function at(o,x,y,z,rx,ry,rz){ o.position.set(x,y,z); o.rotation.set(rx||0,ry||0,rz||0); return o; }
    function zc(rf,rb,z0,z1,m,seg,open){ const g = new THREE.CylinderGeometry(rf,rb,z1-z0,seg||64,1,!!open); g.rotateX(Math.PI/2); return at(new THREE.Mesh(g,m),0,0,(z0+z1)/2); }
    const bx = (w,h,d,m)=>new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m);
    const yc = (r1,r2,h,m,s)=>new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,s||32), m);
    function screw(){ const g = new THREE.Group(); g.add(yc(.028,.028,.014,chrome,12)); const s = bx(.036,.005,.008,blk); s.position.y = .008; g.add(s); return g; }

    /* assembly registry: every part records its final pose and where it drifts in from */
    const cam = new THREE.Group(); cam.position.x = -.35; scene.add(cam);
    const P = [];
    function add(o,t0,d,ox,oy,oz,f){ o.userData = {tp:o.position.clone(), off:new THREE.Vector3(ox,oy,oz), t0:t0, d:d, f:f}; cam.add(o); P.push(o); return o; }

    /* stage 1 — body */
    add(slab(2.6,1.5,1,.2,.05,body), 0,700, 0,0,-.9);
    add(at(slab(2.62,.3,1.02,.09,.03,alloy),0,.68,0), 60,650, 0,1,-.1);
    add(at(slab(2.62,.26,1.02,.09,.03,alloy),0,-.7,0), 60,650, 0,-1,-.1);
    add(at(slab(.58,1.36,.44,.2,.06,rubber),-1.02,-.02,.66), 140,650, -1.3,0,.4);
    add(at(slab(.52,1.1,.05,.08,.02,rubber),.98,-.05,.52), 180,600, 1.2,0,.3);
    add(at(slab(1.5,.92,.06,.06,.015,lcdM),0,-.02,-.5), 220,600, 0,0,-1.2);
    [[2.62,.014,.03,0,.53,.5],[2.62,.014,.03,0,-.55,.5],[.014,1.2,.03,-.7,0,.5]].forEach(s=>add(at(bx(s[0],s[1],s[2],blk),s[3],s[4],s[5]), 300,500, 0,0,-.3));

    /* stage 2 — lens mount and barrel attach */
    add(zc(.72,.72,.5,.6,chrome,64), 450,650, 0,0,1.7);
    [90,210,330].forEach(a=>{ const r = a*Math.PI/180; add(at(bx(.16,.06,.05,satin),Math.cos(r)*.66,Math.sin(r)*.66,.62,0,0,r+Math.PI/2), 480,600, 0,0,1.7); });
    add(at(new THREE.Mesh(new THREE.SphereGeometry(.035,12,12),white),-.5,.52,.61), 500,600, 0,0,1.7);
    add(zc(.6,.6,.6,.74,satin,64), 520,650, 0,0,2.0);
    add(zc(.65,.65,.74,1.24,ribB,96), 600,650, 0,0,2.4).userData.spin = 1;

    /* stage 3 — lens rings and front glass */
    add(zc(.6,.6,1.24,1.29,chrome,64), 850,600, 0,0,2.6);
    add(zc(.64,.64,1.29,1.55,ribM,96), 900,600, 0,0,2.8);
    add(at(bx(.02,.012,.16,white),0,.645,1.42), 900,600, 0,0,2.8);
    add(at(new THREE.Mesh(new THREE.CircleGeometry(.56,48),blk),0,0,1.56), 930,550, 0,0,3.0);
    add(zc(.58,.6,1.55,1.85,satin,64,true), 950,600, 0,0,3.0, 1);
    add(zc(.56,.56,1.85,1.96,ribM,64,true), 1000,550, 0,0,3.2, 1);
    add(at(new THREE.Mesh(new THREE.RingGeometry(.4,.57,64),alloy),0,0,1.965), 1030,520, 0,0,3.4, 1);
    add(at(new THREE.Mesh(new THREE.TorusGeometry(.42,.03,12,64),chrome),0,0,1.97), 1050,500, 0,0,3.5, 1);
    add(zc(.4,.4,1.56,1.96,blk,48,true), 1020,550, 0,0,3.2, 1);
    add(at(new THREE.Mesh(new THREE.RingGeometry(.3,.4,48),blk),0,0,1.75), 1040,520, 0,0,3.2);
    add(at(new THREE.Mesh(new THREE.SphereGeometry(.27,32,12,0,Math.PI*2,0,.5).rotateX(Math.PI/2),coat),0,0,1.363), 1060,500, 0,0,3.2);
    add(at(new THREE.Mesh(new THREE.RingGeometry(.14,.3,9,1),blade),0,0,1.62), 1070,500, 0,0,3.2);
    for(let i=0;i<9;i++){ const a = i/9*Math.PI*2; add(at(bx(.16,.007,.004,blade),Math.cos(a)*.22,Math.sin(a)*.22,1.623,0,0,a+1.1), 1080,500, 0,0,3.2); }
    add(at(new THREE.Mesh(new THREE.SphereGeometry(.98,48,16,0,Math.PI*2,0,.42).rotateX(Math.PI/2),glassM),0,0,1.065), 1100,500, 0,0,3.6, 1);

    /* stage 4 — controls, viewfinder, grip details */
    const hs = new THREE.Shape(); hs.moveTo(-.52,0); hs.lineTo(-.34,.34); hs.lineTo(.34,.34); hs.lineTo(.52,0); hs.closePath();
    const hg = new THREE.ExtrudeGeometry(hs,{depth:.56, bevelEnabled:true, bevelThickness:.04, bevelSize:.04, bevelSegments:2}); hg.translate(0,0,-.28);
    add(at(new THREE.Mesh(hg,body),0,.83,-.05), 1150,550, 0,1.1,0);
    add(at(slab(.5,.26,.12,.05,.02,rubber),0,1.02,-.4), 1170,500, 0,.9,-.2);
    add(at(bx(.52,.025,.42,chrome),0,1.235,-.05), 1200,500, 0,1,0);
    [-.14,.14].forEach(z=>add(at(bx(.52,.02,.04,chrome),0,1.262,z), 1210,480, 0,1,0));
    add(at(bx(.3,.006,.05,blk),0,1.252,-.05), 1220,470, 0,1,0);
    add(at(yc(.22,.22,.15,dialM,48),1.0,.9,0), 1180,550, 0,1.1,0);
    add(at(yc(.19,.19,.02,blk,48),1.0,.985,0), 1220,500, 0,1.1,0);
    add(at(bx(.02,.005,.07,white),1.0,.998,-.09), 1240,480, 0,1.1,0);
    add(at(yc(.13,.13,.12,dialM,36),.63,.89,.3), 1200,520, 0,1.1,0);
    add(at(yc(.1,.1,.02,blk,36),.63,.955,.3), 1230,480, 0,1.1,0);
    add(at(yc(.17,.17,.05,ribM,40),-1.02,.855,.3), 1230,520, 0,1.1,0);
    add(at(yc(.075,.085,.07,chrome,24),-1.02,.9,.3), 1250,500, 0,1.3,0);
    add(at(yc(.045,.045,.03,redM,16),-.55,.84,.3), 1260,480, 0,1.1,0);
    add(at(yc(.05,.05,.03,blk,16),-.3,.84,.3), 1270,470, 0,1.1,0);
    [-1,1].forEach(s=>{ add(at(bx(.1,.16,.16,alloy),s*1.35,.45,-.05), 1250,500, s*.6,0,0); add(at(new THREE.Mesh(new THREE.TorusGeometry(.075,.02,10,24),chrome),s*1.43,.45,-.05,0,Math.PI/2,0), 1270,480, s*.6,0,0); });
    [[1.15,.835,.42,0,0,0],[-1.15,.835,.42,0,0,0],[1.15,-.835,.42,Math.PI,0,0],[-1.15,-.835,.42,Math.PI,0,0],[1.315,.6,.3,0,0,-Math.PI/2],[-1.315,.6,.3,0,0,Math.PI/2]]
      .forEach(s=>add(at(screw(),s[0],s[1],s[2],s[3],s[4],s[5]), 1300,450, 0,.5,0));
    add(at(slab(.36,.08,.02,.02,.005,chrome),.95,.4,.52), 1300,450, 0,.5,0);
    add(at(new THREE.Mesh(new THREE.CircleGeometry(.04,16),blk),-1.02,.38,.885), 1310,440, 0,.5,0);
    add(at(yc(.17,.17,.05,chrome,32),0,-.86,.05), 1320,430, 0,-.6,0);

    const K = (v)=>Math.max(0,Math.min(1,v)), E = (k)=>k<.5 ? 4*k*k*k : 1-Math.pow(-2*k+2,3)/2;
    const ACT = 1750, END = 2200;
    let t0 = null, focusRing = P.find(o=>o.userData.spin);
    function frame(now){
      if(done) return;
      if(t0 === null) t0 = now;
      const t = now - t0, p = K((t-ACT)/(END-ACT)), fz = .05*Math.sin(Math.PI*p);
      for(const o of P){ const u = o.userData, k = E(K((t-u.t0)/u.d)); o.position.set(u.tp.x + u.off.x*(1-k), u.tp.y + u.off.y*(1-k), u.tp.z + u.off.z*(1-k) + (u.f ? fz : 0)); }
      focusRing.rotation.z = E(p)*.8;
      const asm = E(K(t/ACT));
      cam.rotation.y = t < ACT ? 1.05 + (.55-1.05)*asm : .55 + (.42-.55)*E(p);
      cam.rotation.x = -.02;
      shSoft.scale.set(5.2-1.6*asm, 3.2-.9*asm, 1); shSoft.material.opacity = .45 + .55*asm;
      shTight.scale.set(3.3, 1.5, 1); shTight.material.opacity = asm;
      if(t >= ACT) markEl.classList.add('on');
      renderer.render(scene, vc);
      if(t < END) requestAnimationFrame(frame); else end(false);
    }
    requestAnimationFrame(frame);
  }catch(err){ markEl.classList.add('on'); setTimeout(()=>end(true), 500); }
})();
}catch(e){ console.error("module error:", e); }
}
