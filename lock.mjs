/* Narra screen lock: passcode hashing and retry policy. A screen lock, not encryption of the data at rest —
   the interface says so. Uses Web Crypto (available in browsers and Node 20+). */
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes));
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const DEFAULT_ITERATIONS=210000;
export function newSalt(){return b64(crypto.getRandomValues(new Uint8Array(16)));}
export async function hashPasscode(pass,saltB64,iterations=DEFAULT_ITERATIONS){
  const key=await crypto.subtle.importKey("raw",enc.encode(String(pass).normalize("NFKC")),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:unb64(saltB64),iterations},key,256);
  return b64(new Uint8Array(bits));
}
export async function makeLock(pass,{iterations=DEFAULT_ITERATIONS}={}){
  const salt=newSalt();return {salt,iterations,hash:await hashPasscode(pass,salt,iterations),createdAt:new Date().toISOString()};
}
/** Constant-time comparison of the derived hashes. */
export async function verifyPasscode(pass,lock){
  if(!lock?.salt||!lock?.hash) return false;
  const h=await hashPasscode(pass,lock.salt,lock.iterations||DEFAULT_ITERATIONS),a=unb64(h),b=unb64(lock.hash);
  if(a.length!==b.length) return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
  return diff===0;
}
/** Waiting time after repeated wrong attempts: free for the first four, then 1 s, 2 s, 4 s … up to 5 minutes. */
export function retryDelayMs(failed){return failed<5?0:Math.min(300000,1000*2**(failed-5));}
export function passcodeProblem(pass){
  const s=String(pass||"");
  if(s.length<4) return "Нужно не меньше четырёх символов.";
  if(/^(.)\1+$/.test(s)) return "Пароль из одного повторяющегося символа легко угадать.";
  if(["1234","12345","123456","0000","1111","qwerty","password","пароль"].includes(s.toLowerCase())) return "Этот пароль слишком простой.";
  return "";
}
export const INACTIVITY_OPTIONS=[[0,"Не блокировать"],[1,"Через 1 минуту"],[5,"Через 5 минут"],[15,"Через 15 минут"],[60,"Через час"]];

/* ---------- recovery: a hint and a one-time recovery code ----------
   The hint is plain text shown on the lock screen and must never contain the password.
   The recovery code (20 characters, ~100 bits) is shown once, stored only as a salted PBKDF2 hash, and is spent when used. */
const ALPHABET="ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no I, L, O, U, 0, 1: nothing to confuse when copying by hand
export function makeRecoveryCode(){
  const bytes=crypto.getRandomValues(new Uint8Array(20));let s="";
  for(const b of bytes)s+=ALPHABET[b%ALPHABET.length];
  return s.match(/.{4}/g).join("-");
}
export function normalizeRecoveryCode(input){
  return String(input||"").toUpperCase().normalize("NFKC").replace(/[^A-Z0-9]/g,"").replace(/O/g,"0").replace(/[IL]/g,"1");
}
// Both sides are compared in canonical form (upper case, no separators), so spaces, dashes and case never matter.
const canon=s=>normalizeRecoveryCode(s);
export async function makeRecovery(code,{iterations=DEFAULT_ITERATIONS}={}){
  const salt=newSalt();return {salt,iterations,hash:await hashPasscode(canon(code),salt,iterations),createdAt:new Date().toISOString()};
}
export async function verifyRecovery(code,rec){
  if(canon(code).length!==20)return false;
  return verifyPasscode(canon(code),rec);
}
export const HINT_MAX=80;
/** Returns a problem text, or "" when the hint is fine. */
export function hintProblem(hint,pass){
  const h=String(hint||"").trim();if(!h)return "";
  if(h.length>HINT_MAX)return `Подсказка длиннее ${HINT_MAX} символов.`;
  const low=h.toLocaleLowerCase("ru-RU"),p=String(pass||"").toLocaleLowerCase("ru-RU");
  if(p&&(low.includes(p)||p.includes(low)))return "Подсказка не должна содержать сам пароль — её видит любой, кто откроет экран входа.";
  return "";
}
