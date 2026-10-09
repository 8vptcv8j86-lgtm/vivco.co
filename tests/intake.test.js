import test from 'node:test';
import assert from 'node:assert/strict';
import {createIntakeHandler,validatePayload} from '../lib/intake.js';
const payload={name:'VIVCO Test',email:'test@example.com',role:'Brand',message:'Test only',requestId:'f430cd66-8f75-4c4d-b02a-2c309ea5b682',website:''};
const req=(body=payload,headers={})=>new Request('https://www.vivco.co/api/inquiry',{method:'POST',headers:{origin:'https://www.vivco.co','content-type':'application/json','x-forwarded-for':'192.0.2.10',...headers},body:JSON.stringify(body)});
test('validates fields, limits, types and honeypot',()=>{
 assert.ok(validatePayload(payload));
 for(const change of [{name:' \n '},{name:'a'.repeat(201)},{email:'bad'},{email:'x@y'},{role:'Admin'},{message:'x'.repeat(5001)},{message:5},{requestId:'fake'},{website:'bot'},{created_at:'1900-01-01'}])assert.equal(validatePayload({...payload,...change}),null);
 assert.ok(validatePayload({...payload,message:'🌴'.repeat(5000)}));
});
test('blocks cross-site requests, bad content and missing configuration',async()=>{
 const handler=createIntakeHandler();
 assert.equal((await handler(req(payload,{origin:'https://evil.example'}))).status,403);
 assert.equal((await handler(req(payload,{'content-type':'text/plain'}))).status,415);
 assert.equal((await handler(req({...payload,name:' '}))).status,400);
 assert.equal((await handler(req())).status,503);
 assert.equal((await handler(req(payload,{'content-length':'40000'}))).status,413);
});
test('server controls credential, IP hash and database fields',async()=>{
 let sent;const handler=createIntakeHandler({token:'a'.repeat(64),fetchImpl:async(url,opts)=>{sent=JSON.parse(opts.body);return Response.json({status:201});}});
 assert.equal((await handler(req())).status,201);
 assert.equal(sent.p_token,'a'.repeat(64));assert.equal(sent.p_request_id,payload.requestId);
 assert.match(sent.p_rate_key,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(sent).includes('192.0.2.10'));
 assert.equal((await handler(req(payload,{'x-forwarded-for':'fake'}))).status,503);
});
test('maps duplicates, conflict, rate limit and outages safely',async()=>{
 for(const status of [200,409,429]){const handler=createIntakeHandler({token:'a'.repeat(64),fetchImpl:async()=>Response.json({status})});assert.equal((await handler(req())).status,status);}
 for(const fetchImpl of [async()=>{throw Error('offline');},async()=>new Response('error',{status:500}),async()=>Response.json({status:403})])assert.equal((await createIntakeHandler({token:'a'.repeat(64),fetchImpl})(req())).status,503);
});
