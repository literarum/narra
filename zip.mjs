/* Narra ZIP: a tiny, dependency-free writer (stored) and a defensive reader (stored + deflate).
   Used for the single-file full backup and the Markdown folder export. No Zip64: the caller keeps archives well below 4 GB. */
const enc=new TextEncoder(),dec=new TextDecoder("utf-8",{fatal:false});
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=CRC[(c^bytes[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
const u8=d=>typeof d==="string"?enc.encode(d):d instanceof Uint8Array?d:new Uint8Array(d);
function dosDateTime(date){
  const d=date instanceof Date&&!Number.isNaN(date.getTime())?date:new Date();
  const year=Math.max(1980,d.getFullYear());
  return {time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()};
}
/** A file name that is safe on Windows, macOS and inside a ZIP: no separators inside a segment, no control characters, bounded length. */
export function safeSegment(name,fallback="файл"){
  const s=String(name||"").normalize("NFC").replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g," ").replace(/\s+/g," ").trim().replace(/[. ]+$/,"").slice(0,80);
  return s||fallback;
}
export const MAX_ENTRIES=20000,MAX_TOTAL=600*1024*1024,MAX_FILE=250*1024*1024;

export function createZip(files){
  if(files.length>MAX_ENTRIES) throw new Error("В архиве слишком много файлов.");
  const chunks=[],central=[];let offset=0,total=0;
  const seen=new Set();
  for(const f of files){
    let name=String(f.name).replace(/\\/g,"/").replace(/^\/+/,"");
    if(!name||name.split("/").some(p=>p===".."||p==="")) throw new Error(`Недопустимое имя файла: ${f.name}`);
    while(seen.has(name))name=name.replace(/(\.[^./]*)?$/,m=>`~${seen.size}${m||""}`);
    seen.add(name);
    const nameBytes=enc.encode(name),data=u8(f.data),crc=crc32(data),{time,date}=dosDateTime(f.mtime);
    total+=data.length;if(total>MAX_TOTAL||data.length>MAX_FILE) throw new Error("Архив получился слишком большим.");
    const lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(8,0,true);lh.setUint16(10,time,true);lh.setUint16(12,date,true);
    lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,nameBytes.length,true);lh.setUint16(28,0,true);
    chunks.push(new Uint8Array(lh.buffer),nameBytes,data);
    const ch=new DataView(new ArrayBuffer(46));
    ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(10,0,true);ch.setUint16(12,time,true);ch.setUint16(14,date,true);
    ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,nameBytes.length,true);
    ch.setUint32(42,offset,true);
    central.push(new Uint8Array(ch.buffer),nameBytes);
    offset+=30+nameBytes.length+data.length;
  }
  const cdSize=central.reduce((s,c)=>s+c.length,0);
  const end=new DataView(new ArrayBuffer(22));
  end.setUint32(0,0x06054b50,true);end.setUint16(8,files.length,true);end.setUint16(10,files.length,true);end.setUint32(12,cdSize,true);end.setUint32(16,offset,true);
  const all=[...chunks,...central,new Uint8Array(end.buffer)],out=new Uint8Array(all.reduce((s,c)=>s+c.length,0));
  let p=0;for(const c of all){out.set(c,p);p+=c.length;}
  return out;
}

/** Lists the entries of a ZIP without inflating anything. Each item has `read()` that returns the verified bytes. */
export function readZip(bytes){
  const b=u8(bytes),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(b.length<22) throw new Error("Файл слишком мал для архива.");
  let eocd=-1;
  for(let i=b.length-22;i>=Math.max(0,b.length-22-65535);i--)if(v.getUint32(i,true)===0x06054b50){eocd=i;break;}
  if(eocd<0) throw new Error("Это не ZIP-архив или он повреждён.");
  const count=v.getUint16(eocd+10,true),cdSize=v.getUint32(eocd+12,true),cdOff=v.getUint32(eocd+16,true);
  if(count===0xFFFF||cdOff===0xFFFFFFFF) throw new Error("Архивы формата Zip64 не поддерживаются.");
  if(count>MAX_ENTRIES) throw new Error("В архиве слишком много файлов.");
  if(cdOff+cdSize>b.length) throw new Error("Каталог архива повреждён.");
  const items=[];let p=cdOff,totalDeclared=0;
  for(let i=0;i<count;i++){
    if(p+46>b.length||v.getUint32(p,true)!==0x02014b50) throw new Error("Каталог архива повреждён.");
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),csize=v.getUint32(p+20,true),usize=v.getUint32(p+24,true);
    const nlen=v.getUint16(p+28,true),xlen=v.getUint16(p+30,true),clen=v.getUint16(p+32,true),lho=v.getUint32(p+42,true);
    const rawName=b.subarray(p+46,p+46+nlen);
    const name=dec.decode(rawName).replace(/\\/g,"/");
    p+=46+nlen+xlen+clen;
    if(name.endsWith("/")) continue;                                      // directory entry
    if(flags&1) throw new Error("Зашифрованные архивы не поддерживаются.");
    if(name.startsWith("/")||/^[A-Za-z]:/.test(name)||name.split("/").some(s=>s===".."||s==="")) throw new Error("В архиве есть небезопасный путь к файлу.");
    if(usize>MAX_FILE) throw new Error("Файл в архиве слишком большой.");
    totalDeclared+=usize;if(totalDeclared>MAX_TOTAL) throw new Error("Архив слишком большой после распаковки.");
    if(method===8&&usize>1024*1024&&usize/Math.max(1,csize)>200) throw new Error("Подозрительная степень сжатия — файл отклонён.");
    items.push({name,size:usize,method,async read(){
      if(lho+30>b.length||v.getUint32(lho,true)!==0x04034b50) throw new Error("Локальный заголовок файла повреждён.");
      const ln=v.getUint16(lho+26,true),lx=v.getUint16(lho+28,true),start=lho+30+ln+lx;
      if(start+csize>b.length) throw new Error("Данные файла обрезаны.");
      const raw=b.subarray(start,start+csize);
      let out;
      if(method===0) out=raw.slice();
      else if(method===8){
        if(typeof DecompressionStream==="undefined") throw new Error("Этот браузер не умеет распаковывать сжатые архивы.");
        const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        const reader=stream.getReader(),parts=[];let got=0;
        for(;;){const {done,value}=await reader.read();if(done)break;got+=value.length;if(got>usize+1024){await reader.cancel();throw new Error("Размер файла не совпал с заявленным.");}parts.push(value);}
        out=new Uint8Array(got);let q=0;for(const c of parts){out.set(c,q);q+=c.length;}
      }else throw new Error("Неизвестный способ сжатия в архиве.");
      if(out.length!==usize) throw new Error("Размер файла не совпал с заявленным.");
      if(crc32(out)!==crc) throw new Error("Контрольная сумма файла не совпала: архив повреждён.");
      return out;
    }});
  }
  return items;
}
export const utf8=b=>dec.decode(b);
export const toBytes=u8;
