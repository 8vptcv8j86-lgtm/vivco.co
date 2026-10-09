document.querySelectorAll('[data-role]').forEach(link => link.addEventListener('click', () => { document.getElementById('role').value = link.dataset.role; }));
let pending=null;
try{pending=JSON.parse(sessionStorage.getItem('vivcoPendingInquiry'));}catch{}
document.getElementById('leadForm').addEventListener('submit', async function(event) {
 event.preventDefault();
 const button=document.getElementById('submitBtn'), status=document.getElementById('formStatus'), fallback=document.getElementById('emailFallback');
 const payload={name:document.getElementById('name').value.trim(),email:document.getElementById('email').value.trim(),role:document.getElementById('role').value,message:document.getElementById('message').value.trim(),website:document.getElementById('website').value};
 if(!payload.name){status.textContent='Please enter your name.';document.getElementById('name').focus();return;}
 button.disabled=true;button.textContent='Sending…';status.textContent='';fallback.hidden=true;
 const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
  const fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(!pending || pending.fingerprint!==fingerprint)pending={fingerprint,requestId:crypto.randomUUID()};
  try{sessionStorage.setItem('vivcoPendingInquiry',JSON.stringify(pending));}catch{}
  payload.requestId=pending.requestId;
  const response=await fetch('/api/inquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
  if(!response.ok){const error=new Error('Submission not confirmed');error.status=response.status;throw error;}
  this.reset();pending=null;try{sessionStorage.removeItem('vivcoPendingInquiry');}catch{}
  status.textContent="Thank you. Your inquiry has been received. We'll be in touch.";
 }catch(error){
  status.textContent=error.status===429?'Too many inquiries have been sent recently. Your details are still here. Please try again in an hour or email us below.':'We could not confirm submission. Your details are still here. You can retry or send them by email below.';
  fallback.href='mailto:info@vivco.co?subject='+encodeURIComponent('VIVCO inquiry: '+payload.role)+'&body='+encodeURIComponent('Name: '+payload.name+'\nEmail: '+payload.email+'\nRole: '+payload.role+'\n\n'+payload.message);
  fallback.hidden=false;
 }finally{clearTimeout(timeout);button.disabled=false;button.textContent='Send inquiry';}
});
