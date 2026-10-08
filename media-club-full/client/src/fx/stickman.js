/* Verbatim port of the original inline module — do not hand-edit. */
export function initStickman() {
  if (document.querySelector(".sm-rig")) return;
try{(function(){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const brand=document.querySelector('#deck .dk-brand'), logo=document.querySelector('header .logo'), hdr=document.querySelector('header'), home=document.getElementById('home'), deck=document.getElementById('deck');
  if(!brand||!logo||!hdr) return;
  /* joints: [head, shoulder, hip, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB] (x,y pairs) + camera x,y,angle + head tilt. Side view facing right, ground y=140 */
  const POSES={
    sit:    [41,80, 40,96, 50,135, 58,110,70,114, 52,112,64,118, 84,116,88,136, 82,128,104,136, 67,116,0,  -5],
    sitLook:[43,84, 41,97, 50,135, 58,111,70,116, 52,113,64,120, 84,116,88,136, 82,128,104,136, 67,118,10, 16],
    crouch: [66,72, 62,88, 60,118, 70,100,78,104, 64,102,72,108, 78,120,80,136, 66,124,64,136, 75,105,0,   8],
    air:    [62,56, 60,74, 60,104, 74,70,84,60, 70,76,80,66, 80,104,76,124, 48,110,40,124, 84,62,-10, 4],
    stand:  [60,44, 60,60, 60,96, 70,76,76,70, 62,78,70,72, 66,118,70,136, 54,118,50,136, 74,69,0,    0],
    aim:    [60,44, 60,60, 60,96, 76,70,94,55, 68,72,84,55, 66,118,70,136, 54,118,50,136, 90,47,-3,   4],
    check:  [66,50, 62,62, 60,96, 70,80,82,82, 64,82,72,84, 66,118,70,136, 54,118,50,136, 78,80,18,   20]
  };
  const CONTACT=30;            /* x of the head/back in the sit pose: the point that touches the logo */
  const eo=t=>1-Math.pow(1-t,3), ei=t=>t*t*t, eio=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2, eb=t=>{const c=1.5;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), wait=ms=>new Promise(r=>setTimeout(r,ms));
  /* ---- build the SVG: every limb is 3 stacked strokes (edge, body, highlight) so it reads as a lit tube ---- */
  const NS='http://www.w3.org/2000/svg';
  const tube=(w,cls)=>`<g class="${cls||''}"><path data-w="e" fill="none" stroke="var(--smE)" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><path data-w="m" fill="none" stroke="var(--smM)" stroke-width="${(w*.62).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(-.8 -.9)"/><path data-w="h" fill="none" stroke="var(--smH)" stroke-width="${(w*.2).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" transform="translate(-1.6 -1.9)" opacity=".85"/></g>`;
  let rays=''; for(let k=0;k<8;k++){const a=k*Math.PI/4, r1=7, r2=k%2?12:16; rays+=`<line x1="${(Math.cos(a)*r1).toFixed(1)}" y1="${(Math.sin(a)*r1).toFixed(1)}" x2="${(Math.cos(a)*r2).toFixed(1)}" y2="${(Math.sin(a)*r2).toFixed(1)}" stroke="var(--smM)" stroke-width="1.4" stroke-linecap="round"/>`;}
  const rig=document.createElement('div'); rig.className='sm-rig'; rig.setAttribute('aria-hidden','true');
  rig.innerHTML=`<svg viewBox="0 0 140 150" width="100%"><defs>
    <radialGradient id="smHd" cx=".36" cy=".3" r=".78"><stop offset="0" style="stop-color:var(--smH)"/><stop offset=".5" style="stop-color:var(--smM)"/><stop offset="1" style="stop-color:var(--smE)"/></radialGradient>
    <linearGradient id="smCb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--smM)"/><stop offset="1" style="stop-color:var(--smE)"/></linearGradient>
    <linearGradient id="smCp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--smCa)"/><stop offset="1" style="stop-color:var(--smCb)"/></linearGradient>
    <radialGradient id="smFl"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <g class="smBody">
      ${tube(7,'lB')}${tube(6,'aB')}${tube(8.6,'to')}${tube(5,'nk')}${tube(7.4,'lF')}
      <g class="hd"><circle r="11" fill="url(#smHd)" stroke="var(--smE)" stroke-width=".6"/>
        <path d="M-11.4 -1.6C-11.4 -15 11.4 -15 11.4 -1.6Z" fill="url(#smCp)" stroke="var(--smE)" stroke-width=".8"/>
        <path d="M4 -3.6L18 -1Q19.6 .3 17.6 1.4L4 .9Z" fill="url(#smCp)" stroke="var(--smE)" stroke-width=".8"/></g>
      <g class="cam"><rect x="-12" y="-7" width="19" height="14" rx="2.6" fill="url(#smCb)" stroke="var(--smE)" stroke-width=".8"/>
        <path d="M-7 -7L-5 -11H2L4 -7Z" fill="url(#smCb)" stroke="var(--smE)" stroke-width=".8"/>
        <path d="M-10 -5.2H5" stroke="var(--smH)" stroke-width=".9" stroke-linecap="round" opacity=".75"/>
        <rect x="7" y="-4.6" width="7.5" height="9.2" rx="1.6" fill="var(--smE)"/><ellipse cx="14.6" cy="0" rx="1.7" ry="4.4" fill="#e6e6e6" stroke="var(--smE)" stroke-width=".6"/><ellipse cx="14.9" cy="0" rx=".8" ry="2.4" fill="#1b1b1b"/>
        <g class="fl" transform="translate(17 0)" opacity="0"><circle r="10" fill="url(#smFl)"/>${rays}<circle r="4" fill="#fff" stroke="var(--smM)" stroke-width=".6"/></g></g>
      ${tube(6,'aF')}
    </g></svg>`;
  const sh=document.createElement('div'); sh.className='sm-sh'; sh.setAttribute('aria-hidden','true');
  document.body.appendChild(sh); document.body.appendChild(rig);
  const svg=rig.firstElementChild, q=s=>rig.querySelector(s);
  const el={lB:[...q('.lB').children],aB:[...q('.aB').children],to:[...q('.to').children],nk:[...q('.nk').children],lF:[...q('.lF').children],aF:[...q('.aF').children],hd:q('.hd'),cam:q('.cam'),fl:q('.fl')};
  /* ---- state ---- */
  let cur=POSES.sit.slice(), L=0,T=0,S=.7,lift=0,fl=0,kick=0,aimAng=0,trackAmt=0,rotA=-12,face=1,tracking=false,state='sit',gen=0,hover=false,booted=false,busy=false;
  const pe={x:0,y:0}; let tw=[],raf=0;
  const live=()=>home&&home.classList.contains('visible')&&(!deck||!deck.querySelector('.slide.active')||deck.querySelector('.slide.active').dataset.i==='0')&&!document.body.classList.contains('loading');
  function setScale(){ const W=clamp(innerWidth*.075,84,118); rig.style.width=W+'px'; S=W/140; sh.style.width=(66*S)+'px'; sh.style.height=(11*S)+'px'; }
  function seat(){ const lr=logo.getBoundingClientRect(), hr=hdr.getBoundingClientRect(); const g=Math.min(lr.bottom+6,hr.bottom-6); return {left:lr.right+3-CONTACT*S, top:g-140*S}; }
  const rng=document.createRange();
  function textRect(){ rng.selectNodeContents(brand); return rng.getBoundingClientRect(); }
  function spot(){ const r=textRect(), fs=parseFloat(getComputedStyle(brand).fontSize)||80, mid=(r.left+r.right)/2, off=Math.max(80,fs*.9);
    const cx=clamp(pe.x<mid?pe.x+off:pe.x-off, r.left+44*S, r.right-44*S); return {left:cx-60*S, top:r.top+fs*.15-140*S, face:pe.x>cx?1:-1}; }
  /* ---- render: rebuild limb paths from the interpolated joints (only runs while something moves) ---- */
  const setD=(set,d)=>{ for(let i=0;i<3;i++) set[i].setAttribute('d',d); };
  function render(){
    const j=cur, k=kick, jit=k>.02?Math.sin(k*38)*1.1*k:0, ta=trackAmt, ang=aimAng*ta;
    const kx=-3.2*k+jit, ky=1.6*k;
    const hfx=j[8]+kx,hfy=j[9]+ky,hbx=j[12]+kx,hby=j[13]+ky,cx=j[22]+kx,cy=j[23]+ky,sx=j[2]-k*.9;
    setD(el.lB,`M${j[4]} ${j[5]}L${j[18]} ${j[19]}L${j[20]} ${j[21]}l6 1`);
    setD(el.aB,`M${sx} ${j[3]}L${j[10]} ${j[11]}L${hbx} ${hby}`);
    setD(el.to,`M${sx} ${j[3]}L${j[4]} ${j[5]}`);
    setD(el.nk,`M${sx} ${j[3]}L${j[0]} ${j[1]+4}`);
    setD(el.lF,`M${j[4]} ${j[5]}L${j[14]} ${j[15]}L${j[16]} ${j[17]}l6 1`);
    setD(el.aF,`M${sx} ${j[3]}L${j[6]} ${j[7]}L${hfx} ${hfy}`);
    el.hd.setAttribute('transform',`translate(${j[0]-k*1.2} ${j[1]}) rotate(${(j[25]+ang*.4+k*5).toFixed(2)})`);
    el.cam.setAttribute('transform',`translate(${cx.toFixed(2)} ${cy.toFixed(2)}) rotate(${(j[24]+ang).toFixed(2)})`);
    el.fl.setAttribute('opacity',Math.min(1,fl*1.4).toFixed(2)); el.fl.setAttribute('transform',`translate(17 0) scale(${(.5+(1-fl)*1.3).toFixed(2)})`);
    place();
  }
  function place(){ rig.style.transform=`translate3d(${L.toFixed(1)}px,${(T-lift).toFixed(1)}px,0)`; svg.style.transform=`perspective(720px) rotateY(${rotA.toFixed(1)}deg)`;
    const k=1-Math.min(.55,lift/(160*S)); sh.style.transform=`translate3d(${(L+62*S-33*S).toFixed(1)}px,${(T+140*S-5*S).toFixed(1)}px,0) scale(${k.toFixed(2)})`; }
  /* ---- tiny tween engine: one rAF loop that only runs while something is animating or the cursor is being tracked ---- */
  function pump(){ raf=0; const now=performance.now();
    for(let i=tw.length-1;i>=0;i--){ const t=tw[i], p=clamp((now-t.t0)/t.d,0,1); t.f(p); if(p>=1){ tw.splice(i,1); t.r(); } }
    if(tracking) track();
    render(); if(tw.length||tracking) raf=requestAnimationFrame(pump); }
  const kickLoop=()=>{ if(!raf) raf=requestAnimationFrame(pump); };
  const tween=(d,f)=>new Promise(r=>{ tw.push({t0:performance.now(),d,f,r}); kickLoop(); });
  function cancelAll(){ const t=tw; tw=[]; T-=lift; lift=0; t.forEach(x=>x.r()); }
  function toPose(name,d,ease,track){ const a=cur.slice(), b=POSES[name], ta0=trackAmt, ta1=track===undefined?(name==='aim'?1:name==='check'?.3:0):track; ease=ease||eo;
    return tween(d,p=>{ const e=ease(p); for(let i=0;i<a.length;i++) cur[i]=a[i]+(b[i]-a[i])*e; trackAmt=ta0+(ta1-ta0)*clamp(e,0,1); }); }
  function jump(dl,dt,fc,dur,H){ const L0=L,T0=T,J0=cur.slice(),A=POSES.air,C=POSES.crouch,r0=rotA,r1=fc>0?-12:192; face=fc;
    return tween(dur,p=>{ L=L0+(dl-L0)*p; T=T0+(dt-T0)*p; lift=4*H*p*(1-p);
      let a,b,e; if(p<.3){a=J0;b=A;e=eo(p/.3);} else if(p<.72){a=A;b=A;e=0;} else {a=A;b=C;e=ei((p-.72)/.28);}
      for(let i=0;i<cur.length;i++) cur[i]=a[i]+(b[i]-a[i])*e;
      rotA=r0+(r1-r0)*eio(clamp((p-.12)/.7,0,1)); trackAmt*=.9; if(p>=1){ rotA=r1; lift=0; } }); }
  function turn(dir,d){ face=dir; const r0=rotA,r1=dir>0?-12:192; return tween(d||340,p=>{ rotA=r0+(r1-r0)*eio(p); }); }
  function track(){ const cx=L+cur[22]*S, cy=T-lift+cur[23]*S; let dx=pe.x-cx, dy=pe.y-cy; if(face<0) dx=-dx;
    const a=clamp(Math.atan2(dy,Math.max(Math.abs(dx),50))*57.3,-22,38); aimAng+=(a-aimAng)*.12; }
  function shoot(){ return Promise.all([tween(340,p=>{ fl=1-eo(p); }), tween(460,p=>{ kick=(1-eo(p))*(p<.04?p/.04:1); })]).then(()=>{fl=0;kick=0;}); }
  /* ---- the sequences ---- */
  async function go(tap){ const g=++gen; cancelAll(); hover=true; state='up'; busy=true;
    await toPose('crouch',240); if(g!==gen) return;
    const s=spot(); await jump(s.left,s.top,s.face,760,72); if(g!==gen) return;
    tracking=true; kickLoop();
    await toPose('aim',560,eb); if(g!==gen) return; busy=false;
    for(let n=0;;n++){
      await wait(650); if(g!==gen) return;
      await shoot(); if(g!==gen) return;
      await wait(400); if(g!==gen) return;
      if(tap&&n>=1){ leave(); return; }
      if(n%2===0){ busy=true; await toPose('check',560,eio); if(g!==gen) return; await wait(950); if(g!==gen) return; await toPose('aim',480,eb); if(g!==gen) return; busy=false; }
      else { await maybeHop(g); if(g!==gen) return; }
      await wait(1100); if(g!==gen) return;
    } }
  async function maybeHop(g){ const r=textRect(), cx=L+60*S; if(Math.abs(pe.x-cx)<Math.max(210,r.width*.22)) return;
    busy=true; const fs=parseFloat(getComputedStyle(brand).fontSize)||80, off=Math.max(80,fs*.9), dir=pe.x>cx?1:-1;
    const nx=clamp(pe.x+(dir>0?-off:off),r.left+44*S,r.right-44*S), fc=pe.x>nx?1:-1;
    await toPose('crouch',200,eo,0); if(g!==gen) return;
    await jump(nx-60*S,T,fc,560,38); if(g!==gen) return;
    await toPose('aim',420,eb); busy=false; }
  async function leave(){ if(state==='sit') return; hover=false; tracking=false; const g=++gen; cancelAll(); state='back'; busy=true;
    await toPose('stand',200,eo,0); if(g!==gen) return; await toPose('crouch',200); if(g!==gen) return;
    const s=seat(); await jump(s.left,s.top,1,780,66); if(g!==gen) return;
    await toPose('sit',460,eb,0); if(g!==gen) return; state='sit'; busy=false; rig.classList.add('idle'); aimAng=0; idle(); }
  let it=0;
  function idle(){ clearTimeout(it); it=setTimeout(async()=>{ if(state!=='sit'||document.hidden){ idle(); return; } const g=gen;
      await toPose('sitLook',800,eio,0); if(g!==gen) return; await wait(1500); if(g!==gen) return; await toPose('sit',800,eio,0); if(g!==gen) return; idle(); },5200+Math.random()*3800); }
  function enter(tap){ if(reduced||!booted||!live()||hover||busy&&state==='up') return; rig.classList.remove('idle'); clearTimeout(it); go(tap); }
  /* ---- hit-testing: hover only counts over the letters, not the empty row ---- */
  const inside=e=>{ const r=textRect(); return e.clientX>=r.left-6&&e.clientX<=r.right+6&&e.clientY>=r.top-6&&e.clientY<=r.bottom+6; };
  brand.addEventListener('pointermove',e=>{ if(e.pointerType!=='mouse') return; pe.x=e.clientX; pe.y=e.clientY;
    if(!hover){ if(inside(e)) enter(false); } else if(!inside(e)) leave();
    else if(state==='up'&&!busy){ const cx=L+60*S; if(Math.abs(pe.x-cx)>70&&(pe.x>cx?1:-1)!==face){ busy=true; const g=gen; turn(pe.x>cx?1:-1).then(()=>{ if(g===gen) busy=false; }); } } },{passive:true});
  brand.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse'&&hover) leave(); });
  brand.addEventListener('pointerdown',e=>{ if(e.pointerType==='mouse') return; pe.x=e.clientX; pe.y=e.clientY; if(hover) leave(); else enter(true); });
  /* ---- housekeeping: never animate off-screen / in a hidden tab / on another slide ---- */
  new IntersectionObserver(es=>{ if(!es[0].isIntersecting&&hover) leave(); }).observe(brand);
  document.addEventListener('visibilitychange',()=>{ if(document.hidden&&hover) leave(); });
  if(deck) new MutationObserver(()=>{ if(hover&&!live()) leave(); }).observe(deck,{subtree:true,attributes:true,attributeFilter:['class']});
  if(home) new MutationObserver(()=>{ if(hover&&!live()) leave(); }).observe(home,{attributes:true,attributeFilter:['class']});
  let rs=0; addEventListener('resize',()=>{ clearTimeout(rs); rs=setTimeout(()=>{ setScale(); if(state==='sit'){ const s=seat(); L=s.left; T=s.top; render(); } else if(hover) leave(); },150); });
  /* ---- boot: appears sitting by the logo once the opening sequence is done ---- */
  function boot(){ if(booted) return; booted=true; setScale(); const s=seat(); L=s.left; T=s.top; cur=POSES.sit.slice(); rotA=-12; render(); rig.classList.add('on','idle'); sh.classList.add('on'); if(!reduced) idle();
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>{ if(state==='sit'){ const s2=seat(); L=s2.left; T=s2.top; render(); } }); }
  if(!document.body.classList.contains('loading')) setTimeout(boot,300);
  else { const mo=new MutationObserver(()=>{ if(!document.body.classList.contains('loading')){ mo.disconnect(); setTimeout(boot,600); } }); mo.observe(document.body,{attributes:true,attributeFilter:['class']}); setTimeout(boot,8000); }
  window.__sm={enter,leave,pe,get state(){return state;}};
})();}catch(e){console.error('stickman',e);}
}
