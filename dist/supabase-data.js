/* Supabase transport for the existing portal. All authorization is enforced in Postgres. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.createSeaCreditData = factory;
})(typeof window === 'object' ? window : globalThis, function createSeaCreditData(client, redirectUrl) {
  let setupReady = false;
  function fail(error) {
    if (!error) return;
    const code = error.code || '';
    let message = error.message || 'Unable to reach Supabase. Check your connection and try again.';
    if (['PGRST202','PGRST205','42P01','42883'].includes(code)) message = 'Supabase is connected, but the database setup is not complete. The project owner must run supabase/setup.sql in the Supabase SQL Editor.';
    else if (code === 'email_not_confirmed') message = 'Please confirm your email using the link in your inbox, then sign in.';
    else if (code === 'over_email_send_rate_limit') message = 'Supabase has temporarily limited confirmation emails. Wait before retrying or ask the project owner to configure email delivery.';
    else if (code === '40001') message = 'This application changed. Refresh before making another update.';
    else if (['22P02','23514','22003'].includes(code)) message = 'One or more application fields are invalid. Check the values and try again.';
    else if (code === '42501') message = 'Access denied. Check your account role and the database setup.';
    const wrapped = new Error(message);
    wrapped.status = ['bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(code) ? 401 : code==='40001'?409:error.status;
    throw wrapped;
  }
  async function setup() {
    if (setupReady) return;
    const { data, error } = await client.rpc('sea_setup_status');
    fail(error);
    if (data?.schemaVersion !== 1) throw new Error('The database version does not match this app. Apply supabase/setup.sql first.');
    setupReady = true;
  }
  async function currentProfile() {
    const { data, error } = await client.rpc('sea_current_profile');
    fail(error); return data;
  }
  const normalize = a => ({
    id:a.id,userId:a.user_id,reference:a.reference,applicantName:a.applicant_name,applicantEmail:a.applicant_email,
    product:a.product,amount:Number(a.amount),termMonths:a.term_months,phone:a.phone,address:a.address,
    employmentType:a.employment_type,employer:a.employer,jobTitle:a.job_title,monthlyIncome:Number(a.monthly_income),
    purpose:a.purpose,status:a.status,version:a.version,createdAt:a.created_at,updatedAt:a.updated_at,
    history:(a.application_events || []).map(e=>({id:e.id,actorRole:e.actor_role,actorId:e.actor_id,status:e.status,note:e.note,at:e.created_at})).sort((x,y)=>x.at.localeCompare(y.at))
  });
  async function getApplication(id) {
    const { data,error }=await client.from('applications').select('*,application_events(*)').eq('id',id).maybeSingle();
    fail(error);
    if(!data) throw new Error('Application not found or not accessible to this account.');
    return {application:normalize(data)};
  }
  async function request(path, options={}) {
    const method=options.method || 'GET',body=options.body || {};
    if(path==='/auth/logout') { const {error}=await client.auth.signOut({scope:'local'});fail(error);return {ok:true}; }
    await setup();
    if(path==='/auth/me') {
      const {data,error}=await client.auth.getSession();fail(error);
      return {user:data.session?await currentProfile():null};
    }
    if(path==='/auth/register') {
      if(!body.testConsent) throw new Error('Confirm that this is a test account.');
      if(typeof body.name!=='string'||body.name.trim().length<2||body.name.trim().length>100) throw new Error('Enter your full name (2–100 characters).');
      if(typeof body.password!=='string'||body.password.length<12||body.password.length>128) throw new Error('Use a password of 12–128 characters.');
      const {data,error}=await client.auth.signUp({email:body.email.trim(),password:body.password,options:{data:{name:body.name.trim()},emailRedirectTo:redirectUrl}});
      fail(error);
      if(!data.session) return {user:null,needsEmailConfirmation:true};
      return {user:await currentProfile()};
    }
    if(path==='/auth/login') {
      const {error}=await client.auth.signInWithPassword({email:body.email.trim(),password:body.password});fail(error);
      return {user:await currentProfile()};
    }
    if(path==='/auth/resend') {
      const {error}=await client.auth.resend({type:'signup',email:body.email.trim(),options:{emailRedirectTo:redirectUrl}});fail(error);return {ok:true};
    }
    if(path==='/profile'&&method==='PATCH') {
      const {data,error}=await client.rpc('sea_update_profile',{p_name:body.name,p_phone:body.phone,p_address:body.address});fail(error);return {user:data};
    }
    if(path==='/applications'&&method==='GET') {
      const {data,error}=await client.from('applications').select('*,application_events(*)').order('created_at',{ascending:false});fail(error);
      return {applications:data.map(normalize)};
    }
    if(path==='/applications'&&method==='POST') {
      const {data,error}=await client.rpc('sea_submit_application',{p_fields:body,p_request_id:body.requestId});fail(error);
      return getApplication(data);
    }
    const match=path.match(/^\/applications\/([a-f0-9-]{36})(?:\/(review|resubmit|cancel))?$/);
    if(match) {
      if(method==='GET'&&!match[2]) return getApplication(match[1]);
      if(method==='PATCH'&&match[2]) {
        const {data,error}=await client.rpc('sea_change_application',{p_id:match[1],p_version:body.version,p_action:match[2],p_fields:body});fail(error);
        return getApplication(data);
      }
    }
    throw new Error('Unsupported account action. Reload the latest app version.');
  }
  return {request};
});
