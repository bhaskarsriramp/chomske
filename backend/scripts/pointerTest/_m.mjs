import { readCur } from "./cursors.mjs";
for (const f of ["cross", "cross_r", "aero_move"]) {
  try {
    const m = readCur("C:/Windows/Cursors/" + f + ".cur").find((x) => x.w === 32 && x.rgba?.px);
    if (!m) { console.log(f, "no 32px image"); continue; }
    const { w, h, px } = m.rgba;
    let x0=w,y0=h,x1=-1,y1=-1;
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) if (px[(y*w+x)*4+3]>40){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
    console.log(f.padEnd(14), "glyph", ((x1-x0+1)+"x"+(y1-y0+1)).padEnd(7), "at", (x0+","+y0).padEnd(7), "hotspot", m.hx+","+m.hy);
  } catch(e){ console.log(f, "ERR", e.message); }
}
