"use client";

import { useEffect, useRef } from "react";
import { gardenBounds, growthFor, slots, treeSize, maxOwnWater, maxFriendWater, type Garden } from "@/lib/wish-garden";
import { bulge, drift, buildVillage, glows, pathLamps, prism, smokes, pine, pineDetail, player as playerMesh, type Face, type Group, type Vec } from "./wish-scene-mesh";
import { drawGround, drawSky } from "./wish-scene-sky";
import css from "./WishScene.module.css";

type Point = { x: number; y: number };
const keys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);

const ornaments = ["#fcae69", "#fa657d", "#ffe899", "#dca5f3", "#9dddf6", "#ffede4"];
const { left, right, back, front } = gardenBounds;
const withinGarden = (x: number, y: number): Point => ({
  x: Math.min(right, Math.max(left, x)),
  y: Math.min(front, Math.max(back, y)),
});

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? radius * .44 : radius;
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
}

function drawOrnament(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, kind: number) {
  ctx.fillStyle = color;
  if (kind === 1) {
    starPath(ctx, x, y, r * 1.45);
    ctx.fill();
  } else if (kind === 2) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - r * 1.45, y - r);
    ctx.lineTo(x - r * 1.35, y + r);
    ctx.lineTo(x + r * 1.45, y - r);
    ctx.lineTo(x + r * 1.35, y + r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff2d4";
    ctx.fillRect(x - r * .25, y - r * .38, r * .5, r * .76);
  } else if (kind === 3) {
    ctx.beginPath();
    ctx.moveTo(x - r * .65, y + r * 1.35);
    ctx.lineTo(x - r * .65, y - r * .4);
    ctx.quadraticCurveTo(x, y - r * 1.85, x + r * .95, y - r * .4);
    ctx.lineWidth = r * .6;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#fff4e8";
    ctx.stroke();
    ctx.strokeStyle = "#e64855";
    ctx.setLineDash([r * .45, r * .55]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
  } else {
    if (kind === 4) {
      ctx.fillStyle = color + "45";
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, r * (kind === 4 ? .65 : 1), r, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff9e4";
    ctx.beginPath();
    ctx.arc(x - r * .23, y - r * .28, r * .28, 0, Math.PI * 2);
    ctx.fill();
  }
}
const directionButtons = [
  { code: "ArrowUp", label: "앞으로", icon: "↑", dx: 0, dz: -1 },
  { code: "ArrowLeft", label: "왼쪽", icon: "←", dx: -1, dz: 0 },
  { code: "ArrowDown", label: "뒤로", icon: "↓", dx: 0, dz: 1 },
  { code: "ArrowRight", label: "오른쪽", icon: "→", dx: 1, dz: 0 },
];

const layersFor = (ownWater: number) => Math.min(5, 1 + Math.floor(ownWater / 5));
const village = buildVillage();
const plotGroups: Group[] = slots.map(({x,y}) => {
  const faces: Face[] = [];
  prism(faces, x, y, 29, 0, 5, 24, "#72503b", "#a47857", .96);
  drift(faces, x, y, 25, 25, 7, 24, "#e6f0f8");
  return { x, z: y, r: 32, faces };
});

export default function WishScene({ active, blocked, garden, position, onMove, splash }: {
  active: boolean; blocked: boolean; garden: Garden; position: Point; onMove: (point: Point) => void; splash: number | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef({ held: new Set<string>(), yaw: 0, pitch: .17, zoom: 1, stick: {x:0,y:0}, drag: -1 });
  const current = useRef({active,blocked,garden,position,onMove,splash});
  useEffect(() => { current.current={active,blocked,garden,position,onMove,splash}; }, [active,blocked,garden,position,onMove,splash]);
  useEffect(() => {
    const element = canvas.current!;
    const ctx = element.getContext("2d", {alpha:false})!;
    const controls=input.current;
    let frame=0, last=0, cachedTrees: Garden["trees"] | null=null;
    type TreeMesh = { x: number; z: number; size: number; near: Face[]; mid: Face[]; far: Face[] };
    let meshes = new Map<number, TreeMesh>();
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
        const point=withinGarden(x+(side*cos+forward*sin)*speed,z+(side*sin-forward*cos)*speed);
        x=point.x;
        z=point.y;
        state.position=point;
        state.onMove(point);
      }

      const width=Math.min(960,element.clientWidth), height=Math.min(650,element.clientHeight);
      if(!width||!height) return;
      if(element.width!==width||element.height!==height){element.width=width;element.height=height;}
      const pitch=controls.pitch+(controls.zoom-1)*.10, cp=Math.cos(pitch), sp=Math.sin(pitch);
      const cameraX=x-sin*90*controls.zoom, cameraZ=z+cos*90*controls.zoom, cameraHeight=52+(controls.zoom-1)*58, focal=Math.min(width*.91,height*.94);
      const transform=([wx,wy,wz]:Vec):Vec=>{
        const dx=wx-cameraX, dz=wz-cameraZ, vertical=wy-cameraHeight, ahead=dx*sin-dz*cos;
        return [dx*cos+dz*sin,vertical*cp+ahead*sp,ahead*cp-vertical*sp];
      };
      const project=([px,py,pz]:Vec)=>[width/2+px*focal/pz,height*.51-py*focal/pz];
      const horizon=height*.51-focal*Math.tan(pitch);
      drawSky(ctx,width,height,horizon,controls.yaw,focal,time);
      drawGround(ctx,width,height,horizon);
      for (const lamp of pathLamps) {
        const ground = transform([lamp.x, .2, lamp.z]);
        if (ground[2] < 20) continue;
        const [gx, gy] = project(ground);
        const radius = Math.min(170, 78 * focal / ground[2]);
        if (gx < -radius || gx > width + radius || gy < -radius || gy > height + radius) continue;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.scale(1, Math.max(.13, Math.min(.68, gy / height - horizon / height)));
        const light = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        light.addColorStop(0, "#ffd18a91");
        light.addColorStop(.4, "#ffc16840");
        light.addColorStop(1, "#ffc16800");
        ctx.fillStyle = light;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.restore();
      }
      if(cachedTrees!==state.garden.trees){
        cachedTrees=state.garden.trees;
        meshes = new Map(cachedTrees.map(tree => {
          const {x:tx,y:ty}=slots[tree.slot], size=treeSize(tree), layers=layersFor(growthFor(tree));
          const cached = meshes.get(tree.slot);
          if (cached?.size === size) return [tree.slot, cached];
          const lod=(detail:typeof pineDetail.near)=>{const mesh:Face[]=[];pine(mesh,tx,ty,size,layers,detail.segments,detail.rings);return mesh;};
          return [tree.slot, {x:tx,z:ty,size,near:lod(pineDetail.near),mid:lod(pineDetail.mid),far:lod(pineDetail.far)}];
        }));
      }
      const mine=state.garden.mine?.slot;
      if(mine!==undefined&&slots[mine]){
        const plot=slots[mine];
        ctx.strokeStyle=`rgba(253,224,71,${.6+.25*Math.sin(time/300)})`;ctx.lineWidth=2.4;ctx.beginPath();
        let started=false;
        for(let i=0;i<=40;i++){
          const a=i/40*Math.PI*2, v=transform([plot.x+Math.cos(a)*35,2,plot.y+Math.sin(a)*35]);
          if(v[2]<5){started=false;continue;}
          const [qx,qy]=project(v);
          if(started) ctx.lineTo(qx,qy); else ctx.moveTo(qx,qy);
          started=true;
        }
        ctx.stroke();
      }
      const player:Face[]=state.active ? playerMesh(x,z,moving?Math.sin(time*.018)*4:0) : [];
      const ahead=(gx:number,gz:number,radius:number)=>{const dx=gx-cameraX,dz=gz-cameraZ,depth=dx*sin-dz*cos;return depth>-radius-6&&Math.abs(dx*cos+dz*sin)<(depth+radius)*(width/2/focal)+radius;};
      const lists:Face[][]=[];
      for(const group of village) if(ahead(group.x,group.z,group.r)) lists.push(group.faces);
      for(const group of plotGroups) if(ahead(group.x,group.z,group.r)) lists.push(group.faces);
      for(const tree of meshes.values()) if(ahead(tree.x,tree.z,60)){
        const distance=Math.hypot(tree.x-cameraX,tree.z-cameraZ);
        lists.push(distance<230?tree.near:distance<460?tree.mid:tree.far);
      }
      lists.push(player);
      const faces:{color:string;points:number[][];depth:number}[]=[];
      for(const mesh of lists) for(const face of mesh){
        if(face.cull&&face.n[0]*(cameraX-face.c[0])+face.n[1]*(cameraHeight-face.c[1])+face.n[2]*(cameraZ-face.c[2])<=0) continue;
        const verts=face.vertices.map(transform);
        const clipped:Vec[]=[];
        verts.forEach((a,i)=>{
          const b=verts[(i+1)%verts.length];
          if(a[2]>=5) clipped.push(a);
          if((a[2]>=5)!==(b[2]>=5)){const t=(5-a[2])/(b[2]-a[2]);clipped.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,5]);}
        });
        if(clipped.length<3)continue;
        const points=clipped.map(project);
        if(points.every(p=>p[0]<0)||points.every(p=>p[0]>width)||points.every(p=>p[1]<0)||points.every(p=>p[1]>height))continue;
        faces.push({color:face.color,points,depth:verts.reduce((sum,v)=>sum+v[2],0)/verts.length});
      }
      faces.sort((a,b)=>b.depth-a.depth);
      ctx.lineWidth=.6;
      for(const {color,points} of faces){
        ctx.fillStyle=color;ctx.strokeStyle=color;
        ctx.beginPath(); points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.fill();ctx.stroke();
      }
      ctx.globalCompositeOperation="lighter";
      for(const glow of glows){
        const view=transform([glow.x,glow.y,glow.z]);
        if(view[2]<12)continue;
        const [gx,gy]=project(view), radius=Math.min(110,glow.r*focal/view[2]);
        if(gx<-radius||gx>width+radius||gy<-radius||gy>height+radius)continue;
        const halo=ctx.createRadialGradient(gx,gy,0,gx,gy,radius), flicker=.85+.15*Math.sin(time/230+glow.x);
        halo.addColorStop(0,`rgba(${glow.rgb},${.3*flicker})`);halo.addColorStop(1,`rgba(${glow.rgb},0)`);
        ctx.fillStyle=halo;ctx.fillRect(gx-radius,gy-radius,radius*2,radius*2);
      }
      ctx.globalCompositeOperation="source-over";
      for(const source of smokes) for(let k=0;k<5;k++){
        const p=(time*.00016+k/5)%1, view=transform([source.x+Math.sin(time/700+k*2+p*5)*4+p*14,source.y+p*46,source.z]);
        if(view[2]<12)continue;
        const [sx,sy]=project(view), radius=(2.5+p*8)*focal/view[2];
        if(sx<-radius||sx>width+radius||sy<-radius||sy>height+radius||radius<.5)continue;
        ctx.fillStyle=`rgba(226,232,240,${(1-p)*.32})`;ctx.beginPath();ctx.arc(sx,sy,radius,0,Math.PI*2);ctx.fill();
      }
      for(const tree of state.garden.trees){
        const plot=slots[tree.slot], size=treeSize(tree), layers=layersFor(growthFor(tree));
        if (!ahead(plot.x, plot.y, 60)) continue;
        const distance=Math.hypot(plot.x-cameraX,plot.y-cameraZ);
        const count=Math.min(maxFriendWater,tree.friendWater ?? 0);
        const visibleOrnaments=Math.min(count,distance<205?maxFriendWater:distance<410?100:24);
        for(let i=0;i<visibleOrnaments;i++){
          const layer=i%layers, angle=(i*2.399963+tree.slot*1.713)% (Math.PI*2);
          if(Math.cos(angle)*(cameraX-plot.x)+Math.sin(angle)*(cameraZ-plot.y)<0) continue;
          const fraction=.08+((Math.imul(i+tree.slot*13+1,2654435761)>>>0)%997)/997*.78;
          const radius=size*(.5-layer*.07)*bulge(fraction*.56)*1.06;
          const ornament=transform([plot.x+Math.cos(angle)*radius,size*(.21+layer*.16+fraction*.56),plot.y+Math.sin(angle)*radius]);
          if(ornament[2]<8) continue;
          const [ox,oy]=project(ornament);
          if(ox<0||oy<0||ox>width||oy>height) continue;
          const dotsize=Math.max(.7,Math.min(6.5,focal*(count>180?1.05:2.2)/ornament[2]));
          const color=ornaments[(i*17+tree.slot)%ornaments.length];
          drawOrnament(ctx, ox, oy, dotsize, color, (i + tree.slot) % 5);
        }
        {
          const maxed=growthFor(tree)>=maxOwnWater;
          const tip=transform([plot.x,size*(.62+layers*.16)+4,plot.y]);
          if(tip[2]>=10){
            const [sx,sy]=project(tip), radius=Math.max(maxed?3:1.6,Math.min(20,focal*(maxed?7:3.4)/tip[2]));
            const halo=ctx.createRadialGradient(sx,sy,0,sx,sy,radius*(maxed?3:2.4));
            halo.addColorStop(0,maxed?"#ffe9a099":"#ffe9a055");halo.addColorStop(1,"#ffe9a000");
            ctx.fillStyle=halo;ctx.fillRect(sx-radius*3,sy-radius*3,radius*6,radius*6);
            ctx.fillStyle="#ffd966";
            starPath(ctx, sx, sy, radius);
            ctx.fill();
          }
        }
        const label=state.garden.mine?.slot===tree.slot ? state.garden.mine.wish : state.garden.targets.includes(tree.slot)&&!state.garden.watered.includes(tree.slot) ? "✦" : "";
        const view=transform([plot.x,size*(.86+layers*.16)+9,plot.y]);
        if(view[2]<10)continue;
        const [px,py]=project(view);
        ctx.textAlign="center";
        if(label&&view[2]<280){
          ctx.font="bold 13px sans-serif";
          const rows=label.match(/.{1,22}/gu)??[];
          rows.forEach((row,i)=>{
            const baseline=py-14*(rows.length-i-1);
            const w=ctx.measureText(row).width+14;
            ctx.fillStyle="#12233bd9";ctx.beginPath();
            if(ctx.roundRect) ctx.roundRect(px-w/2,baseline-12,w,17,6); else ctx.rect(px-w/2,baseline-12,w,17);
            ctx.fill();
            ctx.fillStyle="#fff4d0";ctx.fillText(row,px,baseline);
          });
        }
        if(state.splash===tree.slot){ctx.font="18px sans-serif";ctx.fillStyle="#fff4d0";ctx.fillText("💧 ✦",px,py+42);}
      }
      for(let i=0;i<80;i++){
        const depth=i%3, px=(i*97+Math.sin(time/900+i)*(10+depth*6)+width*2)%width, py=(i*41+time*(.02+depth*.012+i%4*.004))%height;
        ctx.fillStyle=depth===2?"#ffffffcc":depth===1?"#ffffff99":"#ffffff66";
        ctx.beginPath();ctx.arc(px,py,.7+depth*.7,0,Math.PI*2);ctx.fill();
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
            onMove(withinGarden(position.x+(dx*Math.cos(yaw)-dz*Math.sin(yaw))*9,
              position.y+(dx*Math.sin(yaw)+dz*Math.cos(yaw))*9));
          }}>{icon}</button>)}
      </div>
      <div className={css.zoom} role="group" aria-label="카메라 확대와 축소">
        <button type="button" aria-label="화면 확대" onClick={()=>{input.current.zoom=Math.max(.68,input.current.zoom/1.25);}}>+</button>
        <button type="button" aria-label="화면 축소" onClick={()=>{input.current.zoom=Math.min(4.8,input.current.zoom*1.25);}}>−</button>
      </div>
    </>}
  </div>;
}
