/* Password-protected backup container: "NRENC1" | iterations (u32) | salt (16) | iv (12) | AES-GCM(ciphertext+tag).
   Key: PBKDF2-SHA-256 from the password. A wrong password and a damaged file are indistinguishable (GCM tag), by design. */
const MAGIC=[0x4e,0x52,0x45,0x4e,0x43,0x31]; // "NRENC1"
export const SEAL_ITERATIONS=310000;
const enc=new TextEncoder();
export const isSealed=bytes=>bytes instanceof Uint8Array&&bytes.length>MAGIC.length+4+16+12+16&&MAGIC.every((b,i)=>bytes[i]===b);
async function keyFrom(password,salt,iterations,usage){
  const base=await crypto.subtle.importKey("raw",enc.encode(String(password).normalize("NFKC")),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations},base,{name:"AES-GCM",length:256},false,[usage]);
}
export async function seal(bytes,password,{iterations=SEAL_ITERATIONS}={}){
  if(!password)throw new Error("Нужен пароль.");
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await keyFrom(password,salt,iterations,"encrypt");
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new Uint8Array(MAGIC)},key,bytes));
  const out=new Uint8Array(MAGIC.length+4+16+12+ct.length);
  out.set(MAGIC,0);new DataView(out.buffer).setUint32(MAGIC.length,iterations,false);
  out.set(salt,MAGIC.length+4);out.set(iv,MAGIC.length+20);out.set(ct,MAGIC.length+32);
  return out;
}
export async function unseal(bytes,password){
  if(!isSealed(bytes))throw new Error("Это не защищённая копия Narra.");
  const iterations=new DataView(bytes.buffer,bytes.byteOffset).getUint32(MAGIC.length,false);
  if(iterations<10000||iterations>1000000)throw new Error("Файл повреждён.");
  const salt=bytes.slice(MAGIC.length+4,MAGIC.length+20),iv=bytes.slice(MAGIC.length+20,MAGIC.length+32),ct=bytes.slice(MAGIC.length+32);
  const key=await keyFrom(password,salt,iterations,"decrypt");
  try{return new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:new Uint8Array(MAGIC)},key,ct));}
  catch{throw new Error("Пароль не подошёл или файл повреждён.");}
}
