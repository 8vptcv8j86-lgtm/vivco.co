import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
const roles = new Set(['Brand','Manufacturer','Supplier','Logistics','Investor','Other']);
const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function validatePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['name','email','role','message','requestId','website'].includes(k))) return null;
  if (['name','email','role','message','requestId','website'].some(k => typeof value[k] !== 'string')) return null;
  const name=value.name.trim(), email=value.email.trim(), message=value.message.trim();
  if (!name || [...name].length>200 || email.length>254 || !emailPattern.test(email) || !roles.has(value.role) || [...message].length>5000 || !uuidPattern.test(value.requestId) || value.website) return null;
  return {name,email,role:value.role,message,requestId:value.requestId};
}
const reply=(status,extra={})=>Response.json({ok:status===200||status===201,...extra},{status,headers:{'Cache-Control':'no-store',...(status===429?{'Retry-After':'3600'}:{})}});
async function boundedJson(request) {
  const reader=request.body?.getReader();
  if (!reader) throw new Error('Empty');
  let length=0; const chunks=[];
  while(true) { const {done,value}=await reader.read(); if(done)break; length+=value.length; if(length>32768){await reader.cancel();throw new Error('Too large');} chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createIntakeHandler({token,fetchImpl=fetch,production=true}={}) {
 return async function(request) {
  if(request.method!=='POST') return reply(405);
  if(!['https://www.vivco.co','https://vivco.co'].includes(request.headers.get('origin'))) return reply(403);
  if(request.headers.get('sec-fetch-site')==='cross-site') return reply(403);
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json') return reply(415);
  if(Number(request.headers.get('content-length')||0)>32768) return reply(413);
  let raw;try{raw=await boundedJson(request);}catch{return reply(400);}
  const payload=validatePayload(raw);if(!payload)return reply(400);
  if(!token)return reply(503);
  // Vercel overwrites x-forwarded-for; never trust alternate client headers.
  const ip=request.headers.get('x-forwarded-for')?.trim();
  if(production && (!ip || !isIP(ip)))return reply(503);
  const rateKey=createHmac('sha256',token).update(ip||'local-test').digest('hex');
  try {
   const response=await fetchImpl('https://lmdsmgpyrdsdkzjqrcrq.supabase.co/rest/v1/rpc/submit_inquiry',{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_xmy-vWJ4YRO0mQsl478Rcg_bybb03cC'},body:JSON.stringify({p_token:token,p_request_id:payload.requestId,p_rate_key:rateKey,p_name:payload.name,p_email:payload.email,p_role:payload.role,p_message:payload.message}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)return reply(503);
   const result=await response.json();
   if(![200,201,400,409,429].includes(result.status))return reply(503);
   return reply(result.status);
  }catch{return reply(503);}
 };
}
