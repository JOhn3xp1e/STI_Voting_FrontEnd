// The 3D academic-center building + ASCII filter, with no React and no page markup in it.
// It only needs two <canvas> elements stacked on top of each other inside one container.
// three is pinned to 0.128.0: later releases removed `sRGBEncoding` / `outputEncoding`.
import * as THREE from "three";

/**
 * @param {HTMLCanvasElement} canvas  WebGL canvas (also receives drag / zoom input)
 * @param {HTMLCanvasElement} layer   2D canvas drawn on top for the ASCII glyphs
 * @param {object} [options]
 * @returns controls: setView, setLight, setAscii, setDensity, setSpacing, setAutoRotate, dispose
 */
export function createBuildingScene(canvas, layer, options = {}) {
  const {
    ascii = true,          // start with the ASCII filter on
    density = 9,           // glyph cell size in px (smaller = finer)
    spacing = 0,           // gap between glyph cells in px
    light = 'noon',        // 'noon' | 'golden' | 'dusk'
    view = 'street',       // 'street' | 'front' | 'aerial' | 'side' | 'rear'
    distanceScale = 1,     // >1 pulls the camera back (useful in narrow columns)
    theme = 'dark',        // 'dark' (gold on navy), 'light' (bronze on white), 'gold' (brand gold on a transparent page)
    onViewChange = () => {},   // called with the view name, or null when the user drags away from a preset
  } = options;
  const box0 = canvas.parentElement;               // the container decides the size
  const abort = new AbortController();
  const on = (type, fn, opts = {}) => canvas.addEventListener(type, fn, { ...opts, signal: abort.signal });
  let renderer;
  const PAPERS = {
    light: { bg: '#ffffff', lattice: 'rgba(15,23,42,.14)', ink: (v) => `rgba(${Math.round(132 + v * 44)},${Math.round(94 + v * 34)},${Math.round(12 + v * 14)},${Math.min(1, 0.5 + v * 0.6)})` },
    dark: { bg: '#081022', lattice: 'rgba(120,150,200,.24)', ink: (v) => `rgba(${Math.round(128 + v * 72)},${Math.round(96 + v * 58)},${Math.round(28 + v * 34)},${Math.min(1, 0.38 + v * 0.95)})` },
    // Transparent: the page behind supplies the background and its own dot grid.
    gold: { bg: null, lattice: null, ink: (v) => `rgba(${Math.round(196 + v * 59)},${Math.round(146 + v * 48)},${Math.round(v * 24)},${Math.min(1, 0.42 + v * 0.75)})` },
  };
  const PAPER = PAPERS[theme] || PAPERS.dark;

  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputEncoding=THREE.sRGBEncoding;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.physicallyCorrectLights=true;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(42,1,0.3,1200);

  /* ---------- small utilities ---------- */
  const lin=c=>new THREE.Color(c).convertSRGBToLinear();
  function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
  function rep(t,x,y){const c=t.clone();c.needsUpdate=true;c.repeat.set(x,y);return c;}
  function noise(g,w,h,n,a,dark=true){for(let i=0;i<n;i++){const v=dark?0:255;g.fillStyle=`rgba(${v},${v},${v},${Math.random()*a})`;g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);}}
  function streaks(g,w,h,n,a){for(let i=0;i<n;i++){const x=Math.random()*w,l=30+Math.random()*h*.5;const gr=g.createLinearGradient(0,0,0,l);gr.addColorStop(0,`rgba(40,45,50,${a*Math.random()})`);gr.addColorStop(1,'rgba(40,45,50,0)');g.fillStyle=gr;g.fillRect(x,0,2+Math.random()*6,l);}}

  /* ---------- sky: painted panorama used for background AND reflections ---------- */
  function skyCanvas(p){return canvasTex(2048,1024,(g,w,h)=>{
    const gr=g.createLinearGradient(0,0,0,h*0.5);p.sky.forEach(([s,c])=>gr.addColorStop(s,c));g.fillStyle=gr;g.fillRect(0,0,w,h*0.5);
    const gg=g.createLinearGradient(0,h*0.5,0,h);gg.addColorStop(0,p.horizon);gg.addColorStop(0.08,p.ground);gg.addColorStop(1,p.ground2);g.fillStyle=gg;g.fillRect(0,h*0.5,w,h*0.5);
    // sun glow
    const sx=w*p.sunU,sy=h*p.sunV;const sg=g.createRadialGradient(sx,sy,0,sx,sy,w*p.glow);sg.addColorStop(0,p.sunCol);sg.addColorStop(0.08,p.sunCol2);sg.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=sg;g.fillRect(0,0,w,h*0.56);
    // clouds: soft clustered puffs, flatter near the horizon
    for(let i=0;i<p.clouds;i++){const cx=Math.random()*w,cy=h*(0.1+Math.random()*0.34),sc=0.5+Math.random()*1.4,flat=0.35+0.4*(1-cy/(h*0.5));
      for(let k=0;k<14;k++){const x=cx+(Math.random()-.5)*260*sc,y=cy+(Math.random()-.5)*46*sc*flat,r=(30+Math.random()*70)*sc;
        const cg=g.createRadialGradient(x,y,0,x,y,r);cg.addColorStop(0,p.cloud);cg.addColorStop(1,'rgba(255,255,255,0)');
        g.save();g.translate(x,y);g.scale(1,flat);g.translate(-x,-y);g.fillStyle=cg;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();g.restore();
        // shaded underside
        const ug=g.createRadialGradient(x,y+r*flat*.5,0,x,y+r*flat*.5,r*.8);ug.addColorStop(0,p.cloudShade);ug.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=ug;g.fillRect(x-r,y,r*2,r*flat);}}
    // horizon haze
    const hz=g.createLinearGradient(0,h*0.42,0,h*0.52);hz.addColorStop(0,'rgba(255,255,255,0)');hz.addColorStop(1,p.haze);g.fillStyle=hz;g.fillRect(0,h*0.42,w,h*0.1);
  });}
  const PRESETS={
   noon:{sky:[[0,'#1f5fbe'],[0.6,'#4f93dc'],[0.9,'#9cc4ea'],[1,'#c6dcf0']],horizon:'#cfe2f3',ground:'#6f7f62',ground2:'#4f5c46',sunU:0.30,sunV:0.13,glow:0.22,sunCol:'rgba(255,255,250,1)',sunCol2:'rgba(255,250,235,.55)',cloud:'rgba(255,255,255,.34)',cloudShade:'rgba(110,128,150,.06)',haze:'rgba(225,236,248,.55)',clouds:13,
     sunDir:[-0.42,0.86,0.30],sunColor:'#fff4e2',sunI:4.2,hemiSky:'#cfe4ff',hemiGround:'#8a8f78',hemiI:0.9,env:1.0,exposure:0.78,fog:'#cfe0f0',fogNear:160,fogFar:520,lamps:0},
   golden:{sky:[[0,'#3c68ad'],[0.5,'#86a9d6'],[0.85,'#f3c58c'],[1,'#f7b36a']],horizon:'#f6b56e',ground:'#6c6a55',ground2:'#3f4435',sunU:0.20,sunV:0.43,glow:0.3,sunCol:'rgba(255,244,214,1)',sunCol2:'rgba(255,190,110,.6)',cloud:'rgba(255,226,190,.6)',cloudShade:'rgba(130,90,90,.16)',haze:'rgba(250,196,130,.6)',clouds:22,
     sunDir:[-0.86,0.26,0.44],sunColor:'#ffc98a',sunI:3.4,hemiSky:'#bcd0f0',hemiGround:'#8a6f55',hemiI:0.6,env:0.9,exposure:0.85,fog:'#eec49a',fogNear:140,fogFar:480,lamps:0.4},
   dusk:{sky:[[0,'#0b1430'],[0.55,'#23386a'],[0.86,'#7a5c86'],[1,'#e08a5c']],horizon:'#d9825a',ground:'#2b2f33',ground2:'#15181c',sunU:0.20,sunV:0.5,glow:0.2,sunCol:'rgba(255,170,110,.8)',sunCol2:'rgba(255,120,80,.35)',cloud:'rgba(120,110,150,.5)',cloudShade:'rgba(20,20,40,.25)',haze:'rgba(230,140,100,.5)',clouds:18,
     sunDir:[-0.9,0.08,0.42],sunColor:'#ff9f6a',sunI:0.35,hemiSky:'#3b4f86',hemiGround:'#20242c',hemiI:0.55,env:0.55,exposure:1.05,fog:'#3a3f5e',fogNear:110,fogFar:420,lamps:1}
  };
  const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
  const skyCache={};
  function getSky(k){if(!skyCache[k]){const t=skyCanvas(PRESETS[k]);t.mapping=THREE.EquirectangularReflectionMapping;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;skyCache[k]={bg:t,env:pmrem.fromEquirectangular(t).texture};}return skyCache[k];}

  let asciiOn=true,skyBg=null;const BLACK=new THREE.Color(0x000000);
  /* ---------- lights ---------- */
  const hemi=new THREE.HemisphereLight(0xffffff,0x888888,1);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffffff,4);sun.castShadow=true;
  sun.shadow.mapSize.set(4096,4096);const sc=sun.shadow.camera;sc.left=-85;sc.right=85;sc.top=85;sc.bottom=-85;sc.near=10;sc.far=400;sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.35;sun.shadow.radius=2.5;
  scene.add(sun);scene.add(sun.target);sun.target.position.set(0,6,-26);
  scene.fog=null;

  /* ---------- textures ---------- */
  const T={};
  T.siding=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#c3c8cd';g.fillRect(0,0,w,h);const ph=64;for(let y=0;y<h;y+=ph){const gr=g.createLinearGradient(0,y,0,y+ph);gr.addColorStop(0,'rgba(255,255,255,.22)');gr.addColorStop(.85,'rgba(0,0,0,.02)');gr.addColorStop(.94,'rgba(0,0,0,.30)');gr.addColorStop(1,'rgba(0,0,0,.45)');g.fillStyle=gr;g.fillRect(0,y,w,ph);}g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,0,2,h);g.fillRect(w/2,0,2,h);noise(g,w,h,5000,.05);streaks(g,w,h,24,.06);});
  T.acp=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#b3b9c0';g.fillRect(0,0,w,h);for(let x=0;x<w;x+=128){const gr=g.createLinearGradient(x,0,x+128,0);gr.addColorStop(0,'rgba(255,255,255,.16)');gr.addColorStop(.5,'rgba(255,255,255,0)');gr.addColorStop(1,'rgba(0,0,0,.10)');g.fillStyle=gr;g.fillRect(x,0,128,h);g.fillStyle='rgba(30,36,42,.55)';g.fillRect(x,0,3,h);}g.fillStyle='rgba(30,36,42,.4)';for(let y=0;y<h;y+=256)g.fillRect(0,y,w,3);noise(g,w,h,3000,.04);});
  T.plaster=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#e6e8ea';g.fillRect(0,0,w,h);noise(g,w,h,9000,.035);streaks(g,w,h,40,.07);g.fillStyle='rgba(0,0,0,.10)';for(let x=0;x<w;x+=170)g.fillRect(x,0,2,h);});
  T.concrete=canvasTex(512,512,(g,w,h)=>{g.fillStyle='#b9b7b0';g.fillRect(0,0,w,h);noise(g,w,h,14000,.07);noise(g,w,h,5000,.06,false);g.strokeStyle='rgba(60,60,58,.5)';g.lineWidth=3;for(let i=0;i<=4;i++){g.beginPath();g.moveTo(i*128,0);g.lineTo(i*128,h);g.stroke();g.beginPath();g.moveTo(0,i*128);g.lineTo(w,i*128);g.stroke();}});
  T.roof=canvasTex(1024,1024,(g,w,h)=>{g.fillStyle='#cfccc0';g.fillRect(0,0,w,h);noise(g,w,h,30000,.06);for(let i=0;i<70;i++){const x=Math.random()*w,y=Math.random()*h,r=30+Math.random()*120;const gr=g.createRadialGradient(x,y,0,x,y,r);const d=Math.random()<.5;gr.addColorStop(0,d?'rgba(90,88,80,.16)':'rgba(255,255,250,.14)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}g.strokeStyle='rgba(120,116,105,.35)';g.lineWidth=2;for(let i=1;i<8;i++){g.beginPath();g.moveTo(0,i*128);g.lineTo(w,i*128);g.stroke();}});
  T.sign=canvasTex(2048,160,(g,w,h)=>{g.clearRect(0,0,w,h);g.font='800 118px Inter, Arial, sans-serif';g.textAlign='right';g.textBaseline='middle';g.fillStyle='rgba(8,30,90,.9)';g.fillText('ACADEMIC CENTER',w-104,h/2+12);g.fillStyle='#1650c4';g.fillText('ACADEMIC CENTER',w-110,h/2+6);});
  T.emblem=canvasTex(512,512,(g,w,h)=>{g.clearRect(0,0,w,h);const c=w/2;g.fillStyle='#1450b8';g.beginPath();g.arc(c,c,c-6,0,Math.PI*2);g.fill();g.strokeStyle='#fff';g.lineWidth=12;g.beginPath();g.arc(c,c,c-38,0,Math.PI*2);g.stroke();g.lineWidth=7;for(const s of[-1,1])for(let i=0;i<7;i++){const a=Math.PI/2+s*(0.45+i*0.17),r=c-92;g.beginPath();g.ellipse(c+Math.cos(a)*r,c+Math.sin(a)*r,18,8,a+s*0.9,0,Math.PI*2);g.stroke();}g.fillStyle='#fff';g.beginPath();g.arc(c,c-8,52,0,Math.PI*2);g.fill();});
  T.sign.wrapS=T.emblem.wrapS=T.emblem.wrapT=THREE.ClampToEdgeWrapping;

  /* ---------- materials ---------- */
  const std=(o)=>new THREE.MeshStandardMaterial(o);
  const col=(c,rough=.85,metal=0,extra={})=>std(Object.assign({color:lin(c),roughness:rough,metalness:metal},extra));
  const tex=(t,rx,ry,rough=.85,metal=0,tint='#ffffff')=>std({map:rep(t,rx,ry),color:lin(tint),roughness:rough,metalness:metal});
  const M={
    white:col('#eceef0',.7),whiteACP:col('#f1f2f3',.45,.15),blue:col('#0f49b5',.42,.2),gold:col('#f0b429',.45,.2),
    glass:std({color:lin('#3d5268'),roughness:.05,metalness:.9,envMapIntensity:1.3}),
    glassLit:std({color:lin('#2b2415'),roughness:.3,metalness:.1,emissive:lin('#ffcf85'),emissiveIntensity:0}),
    frame:col('#4f565e',.4,.7),alu:col('#c5cbd1',.35,.8),steel:col('#aab2ba',.3,.9),
    dark:col('#1c2026',1),column:tex(T.plaster,1,2,.8,0,'#d2d5d8'),soffit:col('#8b9299',.7),
    gate:col('#164cbb',.45,.35),ac:col('#dfe3e6',.5,.3),acDark:col('#30353b',.6,.4),
    lamp:new THREE.MeshBasicMaterial({color:0xfff2cf}),
  };

  /* ---------- builders ---------- */
  function box(w,h,d,m,x,y,z,p=scene){const g=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);g.position.set(x,y,z);g.castShadow=true;g.receiveShadow=true;p.add(g);return g;}
  function plane(w,h,m,x,y,z,rx=0,ry=0,p=scene){const g=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);g.position.set(x,y,z);g.rotation.set(rx,ry,0);g.receiveShadow=true;p.add(g);return g;}
  const glassAll=[];
  // a glazed band with aluminium frame, mullions and a transom; ry orients it
  function glazing(w,h,x,y,z,ry,cols,p,recess=0.12){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=ry;p.add(g);
    const gl=new THREE.Mesh(new THREE.PlaneGeometry(w,h),M.glass);gl.position.z=-recess;g.add(gl);glassAll.push(gl);
    const bar=(bw,bh,bx,by)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(bw,bh,0.1),M.frame);b.position.set(bx,by,-recess+0.05);b.castShadow=true;g.add(b);};
    bar(w,0.08,0,h/2-0.04);bar(w,0.08,0,-h/2+0.04);if(h>1.4)bar(w,0.05,0,-h/2+h*0.32);
    for(let i=0;i<=cols;i++)bar(0.06,h,-w/2+i*w/cols,0);
    // reveal (the wall thickness around the opening)
    const rv=(rw,rh,rx,ry2)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(rw,rh,recess),M.frame);b.position.set(rx,ry2,-recess/2);g.add(b);};
    rv(w,0.04,0,h/2);rv(w,0.04,0,-h/2);return g;}
  function louver(w,h,x,y,z,p){const g=new THREE.Group();g.position.set(x,y,z);p.add(g);
    box(w,h,0.06,col('#aeb4ba',.8),0,0,-0.08,g);box(w,0.1,0.14,M.white,0,h/2,0,g);box(w,0.1,0.14,M.white,0,-h/2,0,g);box(0.1,h,0.14,M.white,-w/2,0,0,g);box(0.1,h,0.14,M.white,w/2,0,0,g);
    if(w>2.4)box(0.08,h,0.14,M.white,0,0,0,g);
    const n=Math.floor((h-0.2)/0.17);const geo=new THREE.BoxGeometry(w-0.2,0.025,0.16);
    for(let i=0;i<n;i++){const s=new THREE.Mesh(geo,M.white);s.position.set(0,-h/2+0.18+i*0.17,0);s.rotation.x=0.7;s.castShadow=true;s.receiveShadow=true;g.add(s);}}

  /* ---------- coordinates: x across frontage, z depth (front 0 → back −), y up; 1 unit ≈ 1 m ---------- */
  const B={x0:-9,x1:8,zF:-3,zB:-56,pod:5,fh:3.8};
  const W=B.x1-B.x0,L=B.zF-B.zB,UH=B.fh*4;
  const bld=new THREE.Group();scene.add(bld);

  /* main upper block, long sides with ribbon windows */
  box(W,UH,L,tex(T.siding,L/4.8,UH/4.8,.6,.05),(B.x0+B.x1)/2,B.pod+UH/2,(B.zF+B.zB)/2,bld);
  box(W+0.06,0.25,L+0.06,M.white,(B.x0+B.x1)/2,B.pod+0.12,(B.zF+B.zB)/2,bld); // floor-line band
  for(let f=0;f<4;f++){const y=B.pod+1.95+f*B.fh;
    glazing(46,1.7,B.x1+0.02,y,-31,Math.PI/2,32,bld);glazing(46,1.7,B.x0-0.02,y,-31,-Math.PI/2,32,bld);
    glazing(10,1.7,-0.5,y,B.zB-0.02,Math.PI,7,bld);}
  /* open ground floor (car park) */
  box(W-1.2,B.pod-0.2,44,M.dark,(B.x0+B.x1)/2,(B.pod-0.2)/2,-33,bld);
  plane(W-0.4,46,tex(T.concrete,4,10,.9),(B.x0+B.x1)/2,0.05,-33,-Math.PI/2,0,bld);
  for(let z=-12;z>=-55;z-=7.2)for(const x of[B.x0+0.45,B.x1-0.45])box(0.8,B.pod,0.8,M.column,x,B.pod/2,z,bld);

  /* roof */
  const RY=B.pod+UH;
  box(W+0.3,0.3,L+0.3,tex(T.roof,1,3,.95),(B.x0+B.x1)/2,RY+0.15,(B.zF+B.zB)/2,bld);
  const pm=tex(T.plaster,12,1,.8),pc=M.whiteACP;
  for(const [w,d,x,z] of[[W+0.5,0.35,(B.x0+B.x1)/2,B.zF+0.05],[W+0.5,0.35,(B.x0+B.x1)/2,B.zB-0.05],[0.35,L,B.x0-0.08,(B.zF+B.zB)/2],[0.35,L,B.x1+0.08,(B.zF+B.zB)/2]]){box(w,1.05,d,pm,x,RY+0.52,z,bld);box(w+0.12,0.08,d+0.12,pc,x,RY+1.09,z,bld);}
  box(5.2,3.1,6.4,tex(T.plaster,2,1,.8),B.x1-4,RY+1.55,-47.5,bld);box(5.6,0.2,6.8,M.white,B.x1-4,RY+3.2,-47.5,bld);
  box(1,2.1,0.08,M.acDark,B.x1-6.62,RY+1.3,-46,bld);
  for(let i=0;i<3;i++)for(let j=0;j<2;j++){const x=B.x0+2.4+i*2.1,z=-51+j*2.6;box(1.4,1.1,1.7,M.ac,x,RY+0.95,z,bld);box(1.5,0.1,1.8,M.acDark,x,RY+0.35,z,bld);
    const fan=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.05,24),M.acDark);fan.position.set(x,RY+1.52,z);bld.add(fan);}
  for(let i=0;i<3;i++){const pth=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,9,8),M.alu);pth.rotation.x=Math.PI/2;pth.position.set(B.x0+1.2+i*0.2,RY+0.4,-46);pth.castShadow=true;bld.add(pth);}

  /* front-left bay: glazed floors under stacked blue slabs */
  const fxL=-10.4,fxR=1.2,fw=fxR-fxL;
  box(0.5,UH,5.5,tex(T.siding,1.2,UH/4.8,.6,.05),fxL+1.15,B.pod+UH/2,B.zF-0.2,bld);
  for(let f=0;f<4;f++){const y0=B.pod+f*B.fh;
    box(fw-1.2,1.0,0.35,tex(T.siding,2.2,.21,.6,.05),(fxL+fxR)/2+0.6,y0+0.5,B.zF+0.16,bld);
    glazing(fw-1.6,2.2,(fxL+fxR)/2+0.6,y0+2.1,B.zF+0.2,0,8,bld,0.18);
    const reach=(3-f)*0.6;
    box(fw+reach,0.5,2.6,M.blue,(fxL+fxR)/2-reach/2,y0+3.55,B.zF+1.0,bld);
    box(fw+reach-0.3,0.06,2.3,col('#0b3a94',.5,.2),(fxL+fxR)/2-reach/2,y0+3.27,B.zF+1.0,bld);}

  /* tower panel */
  const tx0=1.2,tx1=8.7,tz=B.zF+0.95,tTop=RY+3.3,tH=tTop-B.pod;
  box(tx1-tx0,tH,1.9,tex(T.acp,(tx1-tx0)/3.2,tH/6.4,.4,.35),(tx0+tx1)/2,B.pod+tH/2,tz-0.95,bld);
  box(tx1-tx0+0.1,0.12,2.0,M.whiteACP,(tx0+tx1)/2,tTop+0.06,tz-0.95,bld);
  [[2.65,13.6],[5.0,9.6],[7.35,13.6]].forEach(([sx,h])=>{const y=B.pod+0.9+h/2;
    glazing(1.3,h,sx,y,tz+0.02,0,1,bld,0.16);
    for(let k=1;k<Math.floor(h/1.9);k++)box(1.3,0.05,0.1,M.frame,sx,y-h/2+k*1.9,tz-0.08,bld);
    box(0.17,tH-0.9,0.07,M.blue,sx-0.86,B.pod+tH/2,tz+0.035,bld);
    box(0.13,tH-3.2,0.07,M.gold,sx+0.86,B.pod+tH/2+1.1,tz+0.035,bld);});
  const emb=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,0.12,56),[M.blue,std({map:T.emblem,roughness:.4,metalness:.2}),M.blue]);emb.rotation.x=Math.PI/2;emb.position.set(5.0,RY-0.5,tz+0.07);emb.castShadow=true;bld.add(emb);

  /* podium: street wall with louvres */
  box(13.2,B.pod,6.2,tex(T.plaster,4,1.5,.8),-3.4,B.pod/2,B.zF+2.6,bld);
  box(13.8,0.32,6.8,M.whiteACP,-3.4,B.pod-0.16,B.zF+2.6,bld);
  box(13.4,0.25,0.3,col('#c9cdd1',.8),-3.4,0.12,B.zF+5.75,bld);
  const pz=B.zF+5.78;louver(3.3,2.9,-8,1.95,pz,bld);louver(3.3,2.9,-4.5,1.95,pz,bld);louver(2.3,2.3,-1.3,2.3,pz,bld);louver(1.7,1.5,-2.2,4.0-0.35,pz,bld);

  /* canopy over entrance + driveway */
  const cz0=-9,cz1=3.3,cy=B.pod+0.35,cx=7.6,cw=16.2;
  box(cw,1.55,cz1-cz0,M.whiteACP,cx,cy+0.78,(cz0+cz1)/2,bld);
  box(cw+0.1,0.06,cz1-cz0+0.1,M.white,cx,cy+1.58,(cz0+cz1)/2,bld);
  for(let i=1;i<8;i++)box(0.03,1.5,0.02,col('#b4b9be',.6),cx-cw/2+i*cw/8,cy+0.78,cz1+0.01,bld);
  const signM=new THREE.MeshStandardMaterial({map:T.sign,transparent:true,alphaTest:0.2,roughness:.4,metalness:.2});
  plane(cw,1.28,signM,cx,cy+0.8,cz1+0.03,0,0,bld);
  plane(cw-0.3,cz1-cz0-0.3,M.soffit,cx,cy-0.005,(cz0+cz1)/2,Math.PI/2,0,bld);
  const lamps=[];for(let i=0;i<9;i++)for(const z of[1.2,-3.5]){const l=new THREE.Mesh(new THREE.CircleGeometry(.14,16),M.lamp.clone());l.rotation.x=Math.PI/2;l.position.set(1.4+i*1.65,cy-0.012,z);bld.add(l);lamps.push(l);}
  for(const x of[6.7,12.4])box(0.95,cy,0.95,M.column,x,cy/2,1.7,bld);
  const canopyLights=[[3.5,-1],[9,-1],[13,0]].map(([x,z])=>{const p=new THREE.PointLight(0xffe0a8,0,26,2);p.position.set(x,cy-0.6,z);scene.add(p);return p;});

  /* entrance */
  box(5.2,4.7,0.2,M.dark,5,2.35,-7,bld);
  for(let s=0;s<3;s++)box(4.8,0.17,0.45,tex(T.concrete,3,.3,.9),4.6,0.085+s*0.17,1.0-s*0.45,bld);
  plane(5,6.5,tex(T.concrete,3,4,.9),4.7,0.52,-3.2,-Math.PI/2,0,bld);
  for(let i=0;i<3;i++){box(0.32,1.0,1.0,M.steel,3.3+i*1.15,1.02,-2,bld);box(0.36,0.06,1.04,M.acDark,3.3+i*1.15,1.55,-2,bld);}
  for(let i=0;i<7;i++){const r=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.05,8),M.steel);r.position.set(2.5+i*0.45,1.05,0.1);r.castShadow=true;bld.add(r);}
  box(2.8,0.05,0.05,M.steel,3.85,1.58,0.1,bld);
  box(1.6,2.4,1.6,tex(T.plaster,1,1,.8),7.3,1.2,-4.5,bld);glazing(1.2,0.9,7.3,1.6,-3.68,0,2,bld,0.04);

  /* driveway gate + boundary wall */
  const gx0=8.9,gx1=14.7;
  plane(gx1-gx0+1.2,16,tex(T.concrete,2,5,.9,0,'#bdbdb6'),(gx0+gx1)/2,0.045,-3,-Math.PI/2,0,bld);
  box(1,2.7,1,tex(T.plaster,1,1,.8),gx1+0.7,1.35,-1.3,bld);box(1.15,0.12,1.15,M.white,gx1+0.7,2.76,-1.3,bld);
  const slat=new THREE.BoxGeometry(0.07,2.1,0.07);for(let x=gx0;x<gx1;x+=0.2){const s=new THREE.Mesh(slat,M.gate);s.position.set(x,1.1,-1.7);s.castShadow=true;bld.add(s);}
  for(const y of[0.25,1.15,2.15])box(gx1-gx0,0.1,0.1,M.gate,(gx0+gx1)/2,y,-1.7,bld);

  /* ---------- lighting presets ---------- */
  function setLight(k){const p=PRESETS[k],s=getSky(k);
    skyBg=s.bg;scene.background=asciiOn?BLACK:s.bg;scene.environment=s.env;
    const d=new THREE.Vector3(...p.sunDir).normalize();sun.position.copy(sun.target.position).addScaledVector(d,180);
    sun.color.copy(lin(p.sunColor));sun.intensity=p.sunI;hemi.color.copy(lin(p.hemiSky));hemi.groundColor.copy(lin(p.hemiGround));hemi.intensity=p.hemiI;
    renderer.toneMappingExposure=p.exposure;
    scene.traverse(o=>{if(o.isMesh){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m.isMeshStandardMaterial&&m!==M.glass)m.envMapIntensity=p.env;});}});
    M.glass.envMapIntensity=1.25*Math.max(p.env,.7);
    canopyLights.forEach(l=>l.intensity=p.lamps*38);lamps.forEach(l=>l.material.color.setScalar(0.25+0.75*Math.max(p.lamps,.15)));
    M.glassLit.emissiveIntensity=p.lamps*1.6;
    glassAll.forEach((g,i)=>{g.material=(p.lamps>0.9&&(i*7+3)%5<3)?M.glassLit:M.glass;});}

  setLight('noon');

  /* ---------- orbit camera ---------- */
  const target=new THREE.Vector3(1,8,-8);
  const sph={r:60,theta:-0.5,phi:1.4};
  const goal={r:60,theta:-0.5,phi:1.4,t:target.clone()};
  const VIEWS={street:{r:46,theta:-0.5,phi:1.64,t:[3,10.5,-8]},front:{r:52,theta:0.02,phi:1.5,t:[3,10.5,-10]},aerial:{r:100,theta:0.02,phi:0.1,t:[2,8,-27]},side:{r:74,theta:1.42,phi:1.42,t:[0,10,-27]},rear:{r:76,theta:2.55,phi:1.25,t:[0,10,-30]}};
  function setView(k){const v=VIEWS[k];Object.assign(goal,{r:v.r,theta:v.theta,phi:v.phi});goal.t.set(...v.t);
    onViewChange(k);}

  const clampPhi=p=>Math.max(0.06,Math.min(1.78,p));
  const ptrs=new Map();let lastPinch=0,mode='orbit';
  const clearPreset=()=>onViewChange(null);
  on('contextmenu',e=>e.preventDefault());
  on('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});mode=(e.button===2||e.shiftKey)?'pan':'orbit';if(ptrs.size===2){const [a,b]=[...ptrs.values()];lastPinch=Math.hypot(a.x-b.x,a.y-b.y);}clearPreset();});
  on('pointermove',e=>{const p=ptrs.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(ptrs.size===2){const [a,b]=[...ptrs.values()];const d=Math.hypot(a.x-b.x,a.y-b.y);if(lastPinch)goal.r=Math.max(14,Math.min(260,goal.r*lastPinch/d));lastPinch=d;pan(dx/2,dy/2);return;}
    if(mode==='pan')pan(dx,dy);else{goal.theta-=dx*0.006;goal.phi=clampPhi(goal.phi-dy*0.006);}});
  const up=e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)lastPinch=0;};
  on('pointerup',up);on('pointercancel',up);
  on('wheel',e=>{e.preventDefault();goal.r=Math.max(14,Math.min(260,goal.r*Math.exp(e.deltaY*0.0012)));clearPreset();},{passive:false});
  function pan(dx,dy){const s=goal.r*0.0016;goal.t.addScaledVector(new THREE.Vector3(Math.cos(sph.theta),0,-Math.sin(sph.theta)),-dx*s);goal.t.y=Math.max(0,goal.t.y+dy*s);}
  setView('street');Object.assign(sph,{r:goal.r,theta:goal.theta,phi:goal.phi});target.copy(goal.t);

  let spin=false;

  /* ---------- ASCII filter: render small, then draw one glyph per cell ---------- */
  const g2=layer.getContext('2d');
  let CELL=9,GAP=0,cols=0,rows=0,rt=null,buf=null,lum=null,dpr=1;
  function setupAscii(){dpr=Math.min(window.devicePixelRatio||1,2);const w=box0.clientWidth||1,h=box0.clientHeight||1;
    layer.width=Math.round(w*dpr);layer.height=Math.round(h*dpr);
    cols=Math.ceil(w/(CELL+GAP));rows=Math.ceil(h/(CELL+GAP));
    if(rt)rt.dispose();rt=new THREE.WebGLRenderTarget(cols,rows,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,format:THREE.RGBAFormat,encoding:THREE.sRGBEncoding});
    buf=new Uint8Array(cols*rows*4);lum=new Float32Array(cols*rows);}
  function drawAscii(){
    renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,cols,rows,buf);renderer.setRenderTarget(null);
    for(let i=0,n=cols*rows;i<n;i++){const k=i*4;lum[i]=(0.2126*buf[k]+0.7152*buf[k+1]+0.0722*buf[k+2])/255;}
    const c=CELL*dpr,pitch=(CELL+GAP)*dpr,off=(pitch-c)/2,W=layer.width,H=layer.height;
    if(PAPER.bg){g2.fillStyle=PAPER.bg;g2.fillRect(0,0,W,H);}else g2.clearRect(0,0,W,H);
    const L=(x,y)=>lum[(rows-1-y)*cols+x]; // render target rows are bottom-up
    const t=Math.max(1,Math.round(c*0.17)),d=Math.max(1,Math.round(c*0.14)); // stroke sizes scale with the cell
    for(let y=0;y<rows;y++){for(let x=0;x<cols;x++){
      const v=L(x,y);const px=x*pitch+off,py=y*pitch+off,cx=px+c/2,cy=py+c/2;
      if(v<0.035){ // empty space: faint dot lattice, like graph paper
        if(PAPER.lattice&&x%4===2&&y%4===2){g2.fillStyle=PAPER.lattice;g2.fillRect(cx-d/2,cy-d/2,d,d);}continue;}
      const xl=x>0?L(x-1,y):v,xr=x<cols-1?L(x+1,y):v,yu=y>0?L(x,y-1):v,yd=y<rows-1?L(x,y+1):v;
      const gx=Math.abs(xr-xl),gy=Math.abs(yd-yu);
      g2.fillStyle=PAPER.ink(v);
      if(v>0.82){ // brightest: boxed cell
        g2.fillRect(px+d,py+d,c-2*d,t);g2.fillRect(px+d,py+c-d-t,c-2*d,t);g2.fillRect(px+d,py+d,t,c-2*d);g2.fillRect(px+c-d-t,py+d,t,c-2*d);g2.fillRect(cx-t/2,cy-t/2,t,t);}
      else if(gx>0.09&&gx>=gy){g2.fillRect(cx-t/2,py,t,c);}                 // vertical edge  → |
      else if(gy>0.09){g2.fillRect(px,cy-t/2,c,t);}                          // horizontal edge → —
      else if(v>0.62){ // bright flat area: star
        g2.fillRect(cx-t/2,py+d,t,c-2*d);g2.fillRect(px+d,cy-t/2,c-2*d,t);if(c>=7)g2.fillRect(cx-t*1.2,cy-t*1.2,t*2.4,t*2.4);}
      else if(v>0.36){g2.fillRect(cx-t,cy-t,t*2,t*2);}                        // mid: bold dot
      else if(v>0.16){g2.fillRect(cx-t/2,cy-t/2,t,t);}                        // dim: dot
      else if((x+y)%2===0){g2.fillRect(cx-d/2,cy-d/2,d,d);}                   // darkest: sparse specks
    }}
  }

  function setAscii(enabled){asciiOn=enabled;canvas.style.opacity=enabled?'0':'1';layer.style.display=enabled?'block':'none';scene.background=enabled?BLACK:skyBg;}

  // glyph cell size in px (smaller = finer)
  function setDensity(px){CELL=Math.max(4,Math.min(24,Number(px)));setupAscii();}

  // empty gap between glyph cells (the glyph keeps its size, the grid gets looser)
  function setSpacing(px){GAP=Math.max(0,Number(px));setupAscii();}

  function resize(){const w=box0.clientWidth||1,h=box0.clientHeight||1;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();setupAscii();}
  const ro=new ResizeObserver(resize);ro.observe(box0);resize();setAscii(ascii);setDensity(density);setSpacing(spacing);
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf=0,alive=true;
  function frame(){
    if(spin)goal.theta+=0.0012;   // ≈ one turn every 90 s at 60 fps
    const k=reduce?1:0.1;
    sph.r+=(goal.r-sph.r)*k;sph.theta+=(goal.theta-sph.theta)*k;sph.phi+=(goal.phi-sph.phi)*k;target.lerp(goal.t,k);
    camera.position.set(target.x+sph.r*Math.sin(sph.phi)*Math.sin(sph.theta),Math.max(1.5,target.y+sph.r*Math.cos(sph.phi)),target.z+sph.r*Math.sin(sph.phi)*Math.cos(sph.theta));
    camera.lookAt(target);if(asciiOn)drawAscii();else renderer.render(scene,camera);if(alive)raf=requestAnimationFrame(frame);}
  frame();

  if (light !== 'noon') setLight(light);
  if (view !== 'street') setView(view);
  if (distanceScale !== 1) { goal.r *= distanceScale; sph.r = goal.r; }

  return {
    setView, setLight, setAscii, setDensity, setSpacing,
    setAutoRotate(v) { spin = !!v; },
    dispose() {
      alive = false; cancelAnimationFrame(raf); ro.disconnect(); abort.abort();
      if (rt) rt.dispose();
      Object.values(skyCache).forEach((s) => { s.bg.dispose(); s.env.dispose(); });
      pmrem.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      renderer.dispose();
    },
  };
}
