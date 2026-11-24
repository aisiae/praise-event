"use client";

import { useEffect, useRef } from "react";
import { slots, treeSize, maxFriendWater, type Garden } from "@/lib/wish-garden";
import css from "./WishScene.module.css";

type Point = { x: number; y: number };
type Vec = [number, number, number];
type Face = { vertices: Vec[]; color: string };
const keys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);

function box(mesh: Face[], x: number, z: number, width: number, depth: number, low: number, high: number, sides: string, top: string) {
  const ring = (height: number): Vec[] => [[x-width/2,height,z-depth/2],[x+width/2,height,z-depth/2],[x+width/2,height,z+depth/2],[x-width/2,height,z+depth/2]];
  const base = ring(low), roof = ring(high);
  roof.forEach((vertex, i) => mesh.push({vertices:[base[i],base[(i+1)%4],roof[(i+1)%4],vertex],color:sides}));
  mesh.push({vertices:roof,color:top});
}

const foliage = ["#315c4e", "#3c715a", "#4c8065", "#59896e", "#386d57", "#254c43", "#315e4d", "#23483e"];
const ornaments = ["#fcae69", "#fa657d", "#ffe899", "#dca5f3", "#9dddf6", "#ffede4"];
const directionButtons = [
  { code: "ArrowUp", label: "앞으로", icon: "↑", dx: 0, dz: -1 },
  { code: "ArrowLeft", label: "왼쪽", icon: "←", dx: -1, dz: 0 },
  { code: "ArrowDown", label: "뒤로", icon: "↓", dx: 0, dz: 1 },
  { code: "ArrowRight", label: "오른쪽", icon: "→", dx: 1, dz: 0 },
];

function pine(mesh: Face[], x: number, z: number, size: number, layers: number, detailed = false) {
  box(mesh,x,z,size*.12,size*.12,0,size*.46,"#644437","#87634a");
  const segments = detailed ? 40 : 8;
  const rings = detailed ? [.0, .13, .24, .38, .58] : [.0, .22, .58];
  for (let layer = 0; layer < layers; layer++) {
    const radius = size * (.44 - layer * .063), level = size * (.2 + layer * .16);
    const point = (side: number, height: number): Vec => {
      const angle = side * Math.PI * 2 / segments;
      const scallop = detailed ? 1 + Math.cos(angle * 8) * .09 + Math.sin(angle * 13) * .035 : 1;
      const spread = radius * Math.max(0, 1 - height / .58) * scallop;
      return [x + Math.cos(angle) * spread, level + size * height, z + Math.sin(angle) * spread];
    };
    for (let face = 0; face < segments; face++) {
      for (let band = 0; band < rings.length - 1; band++) {
        const low = rings[band], high = rings[band+1];
        const shade = detailed ? Math.floor((face + band * 1.7) / 5) % foliage.length : face;
        const vertices = [point(face, low), point(face+1, low), point(face+1, high)];
        if (band < rings.length - 2) vertices.push(point(face, high));
        mesh.push({ vertices, color: band === rings.length - 2 && (shade === 2 || shade === 3) ? "#8eb2a0" : foliage[shade] });
      }
    }
  }
}

function courtyard() {
  const mesh: Face[] = [];
  for(let i=0;i<13;i++) box(mesh,518,181+i*47,91,43,0,2,"#879da5", i%2?"#b8c8c8":"#c6d4d3");
  for(const x of [25,1015]) {
    box(mesh,x,479,18,610,0,36,"#756e68","#e7eff4");
    for(let z=210;z<790;z+=85) box(mesh,x,z,28,28,0,48,"#8b776e","#eef6f8");
  }
  box(mesh,518,105,395,130,0,17,"#6d7478","#cbd2d8");
  box(mesh,518,105,360,108,17,106,"#7e3738","#694a46");
  for(let x=362;x<=674;x+=39) {
    box(mesh,x,160,28,2,29,91,"#e3ae6f","#ffe0a1");
    box(mesh,x-16,165,8,9,17,111,"#773d42","#475e54");
  }
  const roofFront: Vec[]=[[304,104,177],[341,116,171],[695,116,171],[732,104,177],[647,177,104],[389,177,104]];
  mesh.push({vertices:roofFront,color:"#334858"});
  mesh.push({vertices:[[389,177,104],[647,177,104],[732,104,32],[304,104,32]],color:"#485c68"});
  for(let x=320;x<=716;x+=18) {
    const ridge=389+(x-304)*258/428;
    mesh.push({vertices:[[x,111,174],[x+5,112,174],[ridge+4,178,104],[ridge,178,104]],color:"#738690"});
    box(mesh,x,176,5,5,99,105,"#f2bb69","#ffdfa4");
  }
  for (const z of [227,370,535,700]) for (const x of [453,583]) {
    box(mesh,x,z,5,5,0,32,"#685148","#ae8d71");
    box(mesh,x,z,13,13,31,46,"#d29d56","#fff1b2");
    box(mesh,x,z,18,18,46,49,"#803342","#fff2df");
  }
  for(let i=0;i<16;i++) pine(mesh, (i%2?1050:-15)+(i%3-1)*13, 55+Math.floor(i/2)*106, 73+i%4*12, 3);
  for(const x of [463,573]) box(mesh,x,772,13,15,0,91,"#783e46","#eedde0");
  box(mesh,518,772,145,22,87,105,"#453c55","#f2edf0");
  return mesh;
}

const layersFor = (ownWater: number) => Math.min(5, 1 + Math.floor(ownWater / 5));
const staticMesh = courtyard();

export default function WishScene({ active, blocked, garden, position, onMove, splash }: {
  active: boolean; blocked: boolean; garden: Garden; position: Point; onMove: (point: Point) => void; splash: number | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef({ held: new Set<string>(), yaw: 0, pitch: .23, zoom: 1, stick: {x:0,y:0}, drag: -1 });
  const current = useRef({active,blocked,garden,position,onMove,splash});
  useEffect(() => { current.current={active,blocked,garden,position,onMove,splash}; }, [active,blocked,garden,position,onMove,splash]);
  useEffect(() => {
    const element = canvas.current!;
    const ctx = element.getContext("2d", {alpha:false})!;
    const controls=input.current;
    let frame=0, last=0, cachedTrees: Garden["trees"] | null=null;
    let plots: Face[] = [];
    let meshes: { x:number; z:number; near:Face[]; far:Face[] }[] = [];
    const clear=()=>{controls.held.clear(); controls.drag=-1; controls.stick={x:0,y:0};};
    const down=(event:KeyboardEvent)=>{
      if(!current.current.active||current.current.blocked||!keys.has(event.code)|| (event.target instanceof HTMLElement && event.target.closest("input,textarea,[contenteditable]"))) return;
      controls.held.add(event.code);
      event.preventDefault();
    };
    const wheel=(event:WheelEvent)=>{
      if(!current.current.active||current.current.blocked) return;
      event.preventDefault();
      controls.zoom=Math.max(.68,Math.min(4.8,controls.zoom*Math.exp(Math.sign(event.deltaY)*.14)));
    };
    const up=(event:KeyboardEvent)=>controls.held.delete(event.code);
    const look=(event:MouseEvent)=>{
      if(document.pointerLockElement!==element||current.current.blocked) return;
      controls.yaw+=event.movementX*.004;
      controls.pitch=Math.max(-.12,Math.min(.75,controls.pitch+event.movementY*.003));
    };
    function draw(time:number) {
      frame=requestAnimationFrame(draw);
      if(time-last<30 || document.hidden) return;
      const elapsed=Math.min(65,time-last);
      last=time;
      const state=current.current;
      const sign=(positive:string,alternate:string)=>Number(controls.held.has(positive)||controls.held.has(alternate));
      const side=sign("ArrowRight","KeyD")-sign("ArrowLeft","KeyA")+controls.stick.x;
      const forward=sign("ArrowUp","KeyW")-sign("ArrowDown","KeyS")-controls.stick.y;
      const sin=Math.sin(controls.yaw), cos=Math.cos(controls.yaw);
      let {x,y:z}=state.position;
      const moving=state.active&&!state.blocked&&Math.hypot(side,forward)>.06;
      if(moving){
        const speed=elapsed*.17/Math.max(1,Math.hypot(side,forward));
        x=Math.min(990,Math.max(48,x+(side*cos+forward*sin)*speed));
        z=Math.min(756,Math.max(184,z+(side*sin-forward*cos)*speed));
        const point={x,y:z};
        state.position=point;
        state.onMove(point);
      }

      const width=Math.min(960,element.clientWidth), height=Math.min(650,element.clientHeight);
      if(!width||!height) return;
      if(element.width!==width||element.height!==height){element.width=width;element.height=height;}
      const sky=ctx.createLinearGradient(0,0,0,height);
      sky.addColorStop(0,"#172840");sky.addColorStop(.65,"#62788b");sky.addColorStop(1,"#acb9c5");
      ctx.fillStyle=sky;ctx.fillRect(0,0,width,height);
      const pitch=controls.pitch+(controls.zoom-1)*.10, cp=Math.cos(pitch), sp=Math.sin(pitch);
      const cameraX=x-sin*90*controls.zoom, cameraZ=z+cos*90*controls.zoom, cameraHeight=52+(controls.zoom-1)*58, focal=Math.min(width*.91,height*.94);
      const transform=([wx,wy,wz]:Vec):Vec=>{
        const dx=wx-cameraX, dz=wz-cameraZ, vertical=wy-cameraHeight, ahead=dx*sin-dz*cos;
        return [dx*cos+dz*sin,vertical*cp+ahead*sp,ahead*cp-vertical*sp];
      };
      const project=([px,py,pz]:Vec)=>[width/2+px*focal/pz,height*.51-py*focal/pz];
      const ground=height*.51-focal*Math.tan(pitch);
      ctx.fillStyle="#d5e1e7";ctx.fillRect(0,ground,width,height-ground);
      if(cachedTrees!==state.garden.trees){
        cachedTrees=state.garden.trees;
        const bySlot=new Map(cachedTrees.map(tree=>[tree.slot,tree]));
        plots=[];
        meshes=[];
        slots.forEach(({x,y},slot)=>{
          const tree=bySlot.get(slot);
          box(plots,x,y,35,27,0,1,"#9eb0b4","#b7c7c8");
          if (tree) {
            const near:Face[] = [], far:Face[] = [];
            const size=treeSize(tree), layers=layersFor(tree.ownWater ?? 0);
            pine(near,x,y,size,layers,true);
            pine(far,x,y,size,layers);
            meshes.push({x,z:y,near,far});
          }
        });
      }
      const player:Face[]=[];
      if(state.active){
        const gait=moving?Math.sin(time*.018)*4:0;
        box(player,x-5,z+gait,6,7,0,13,"#243345","#304453");
        box(player,x+5,z-gait,6,7,0,13,"#243345","#304453");
        box(player,x,z,17,11,11,32,"#a53349","#e6e4d9");
        box(player,x,z,13,11,31,44,"#e2b992","#8e3044");
        box(player,x,z+1,15,13,39,44,"#8e3044","#b84459");
        box(player,x,z+1,5,5,44,48,"#eee8de","#fff4e7");
      }
      const trees=meshes.flatMap(mesh=>Math.hypot(mesh.x-cameraX,mesh.z-cameraZ)<270?mesh.near:mesh.far);
      const faces=[...staticMesh,...plots,...trees,...player].flatMap(face=>{
        const verts=face.vertices.map(transform);
        const clipped:Vec[]=[];
        verts.forEach((a,i)=>{
          const b=verts[(i+1)%verts.length];
          if(a[2]>=5) clipped.push(a);
          if((a[2]>=5)!==(b[2]>=5)){const t=(5-a[2])/(b[2]-a[2]);clipped.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,5]);}
        });
        if(clipped.length<3)return [];
        const points=clipped.map(project);
        if(points.every(p=>p[0]<0)||points.every(p=>p[0]>width)||points.every(p=>p[1]<0)||points.every(p=>p[1]>height))return [];
        return [{color:face.color,points,depth:verts.reduce((sum,v)=>sum+v[2],0)/verts.length}];
      }).sort((a,b)=>b.depth-a.depth);
      for(const {color,points} of faces){
        ctx.fillStyle=color;
        ctx.beginPath(); points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.fill();
      }
      for(const tree of state.garden.trees){
        const plot=slots[tree.slot], size=treeSize(tree), layers=layersFor(tree.ownWater ?? 0);
        const distance=Math.hypot(plot.x-cameraX,plot.y-cameraZ);
        const count=Math.min(maxFriendWater,tree.friendWater ?? 0);
        const visibleOrnaments=Math.min(count,distance<205?maxFriendWater:distance<410?100:24);
        for(let i=0;i<visibleOrnaments;i++){
          const layer=i%layers, angle=(i*2.399963+tree.slot*1.713)% (Math.PI*2);
          if(Math.cos(angle)*(cameraX-plot.x)+Math.sin(angle)*(cameraZ-plot.y)<0) continue;
          const fraction=.08+((Math.imul(i+tree.slot*13+1,2654435761)>>>0)%997)/997*.78;
          const radius=size*(.44-layer*.063)*(1-fraction*.95);
          const ornament=transform([plot.x+Math.cos(angle)*radius,size*(.21+layer*.16+fraction*.56),plot.y+Math.sin(angle)*radius]);
          if(ornament[2]<8) continue;
          const [ox,oy]=project(ornament);
          if(ox<0||oy<0||ox>width||oy>height) continue;
          const dotsize=Math.max(.6,Math.min(3.2,focal*(count>180?.46:.78)/ornament[2]));
          ctx.fillStyle=ornaments[(i*17+tree.slot)%ornaments.length];
          ctx.beginPath();ctx.arc(ox,oy,dotsize,0,Math.PI*2);ctx.fill();
        }
        const label=state.garden.mine?.slot===tree.slot ? state.garden.mine.wish : state.garden.targets.includes(tree.slot)&&!state.garden.watered.includes(tree.slot) ? "✦" : "";
        const view=transform([plot.x,size*(.86+layers*.16)+9,plot.y]);
        if(view[2]<10)continue;
        const [px,py]=project(view);
        ctx.textAlign="center";
        if((tree.ownWater ?? 0)>=23){ctx.font="20px sans-serif";ctx.fillStyle="#ffda7a";ctx.fillText("★",px,py+16);}
        if(label&&view[2]<280){
          ctx.font="bold 13px sans-serif";ctx.fillStyle="#192637";
          const rows=label.match(/.{1,22}/gu)??[];
          rows.forEach((row,i)=>{
            const baseline=py-14*(rows.length-i-1);
            const w=ctx.measureText(row).width+12;
            ctx.fillStyle="#24354a";ctx.fillRect(px-w/2,baseline-12,w,15);
            ctx.fillStyle="#fff4d0";ctx.fillText(row,px,baseline);
          });
        }
        if(state.splash===tree.slot){ctx.font="18px sans-serif";ctx.fillText("💧 ✦",px,py+42);}
      }
      ctx.fillStyle="#ffffffa3";
      for(let i=0;i<45;i++){
        const px=(i*97+Math.sin(time/900+i)*15+width*2)%width, py=(i*41+time*(.022+i%4*.009))%height;
        ctx.fillRect(px,py,i%3+1,i%3+1);
      }
    }
    frame=requestAnimationFrame(draw);
    element.addEventListener("wheel",wheel,{passive:false});
    window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",clear);
    document.addEventListener("mousemove",look);document.addEventListener("visibilitychange",clear);
    return ()=>{element.removeEventListener("wheel",wheel);cancelAnimationFrame(frame);window.removeEventListener("keydown",down);window.removeEventListener("keyup",up);window.removeEventListener("blur",clear);document.removeEventListener("mousemove",look);document.removeEventListener("visibilitychange",clear);if(document.pointerLockElement===element)document.exitPointerLock();};
  },[]);
  useEffect(()=>{if((blocked||!active)&&document.pointerLockElement===canvas.current)document.exitPointerLock();},[blocked,active]);

  const dragPoint = useRef({x:0,y:0});
  const joystick = useRef({ pointer:-1, x:0, y:0 });
  function endStick(element: HTMLDivElement) {
    joystick.current.pointer=-1;
    input.current.stick={x:0,y:0};
    element.style.setProperty("--dx","0px");
    element.style.setProperty("--dy","0px");
  }
  return <div className={css.surface}>
    <canvas ref={canvas} tabIndex={active?0:-1} aria-label="3D 소원나무 마당. 마우스로 둘러보고 방향키로 이동하세요."
      onClick={event=>{if(active&&matchMedia("(pointer:fine)").matches) {try{void event.currentTarget.requestPointerLock()?.catch(()=>{});}catch{/* Drag remains available. */}}}}
      onPointerDown={event=>{if(!active||blocked)return;input.current.drag=event.pointerId;dragPoint.current={x:event.clientX,y:event.clientY};event.currentTarget.setPointerCapture(event.pointerId);}}
      onLostPointerCapture={()=>{input.current.drag=-1;}}
      onPointerMove={event=>{if(input.current.drag!==event.pointerId||document.pointerLockElement===event.currentTarget)return;input.current.yaw+=(event.clientX-dragPoint.current.x)*.008;input.current.pitch=Math.max(-.12,Math.min(.75,input.current.pitch+(event.clientY-dragPoint.current.y)*.005));dragPoint.current={x:event.clientX,y:event.clientY};}} />
    {active && <>
      <div className={css.joystick} aria-label="오른쪽 이동 조이스틱" role="group"
        onPointerDown={event=>{
          if (blocked || joystick.current.pointer !== -1) return;
          joystick.current={pointer:event.pointerId,x:event.clientX,y:event.clientY};
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event=>{
          const origin=joystick.current;
          if (origin.pointer !== event.pointerId) return;
          const dx=event.clientX-origin.x, dy=event.clientY-origin.y;
          const norm=Math.max(24,Math.hypot(dx,dy));
          input.current.stick={x:dx/norm,y:dy/norm};
          event.currentTarget.style.setProperty("--dx",dx/norm*24+"px");
          event.currentTarget.style.setProperty("--dy",dy/norm*24+"px");
        }}
        onLostPointerCapture={event=>endStick(event.currentTarget)}>
        <span aria-hidden="true">✥</span><small>이동</small>
      </div>
      <div className={css.pad} role="group" aria-label="이동 방향 버튼">
        {directionButtons.map(({code,label,icon,dx,dz}) => <button type="button" key={code} aria-label={label}
          onPointerDown={event=>{
            event.currentTarget.setPointerCapture(event.pointerId);
            input.current.held.add(code);
          }}
          onLostPointerCapture={()=>input.current.held.delete(code)}
          onClick={()=>{
            if(blocked) return;
            const yaw=input.current.yaw;
            onMove({x:Math.min(990,Math.max(48,position.x+(dx*Math.cos(yaw)-dz*Math.sin(yaw))*9)),
              y:Math.min(756,Math.max(184,position.y+(dx*Math.sin(yaw)+dz*Math.cos(yaw))*9))});
          }}>{icon}</button>)}
      </div>
      <div className={css.zoom} role="group" aria-label="카메라 확대와 축소">
        <button type="button" aria-label="화면 확대" onClick={()=>{input.current.zoom=Math.max(.68,input.current.zoom/1.25);}}>+</button>
        <button type="button" aria-label="화면 축소" onClick={()=>{input.current.zoom=Math.min(4.8,input.current.zoom*1.25);}}>−</button>
      </div>
    </>}
  </div>;
}
