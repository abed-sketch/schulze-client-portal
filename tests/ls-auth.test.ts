import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLearningSuiteIdentity } from '../supabase/functions/portal-session/auth.ts';
const identity = { id:'ls-user', enabled:true, emailVerified:true, email:' ABED@apex-consulting.ai ' };
test('LS identity is obtained from the fixed trusted endpoint, never decoded claims',async()=>{
 const user=await verifyLearningSuiteIdentity('opaque-token',async(input,init)=>{
  assert.equal(String(input),'https://api-p.learningsuite.io/cm3zyh40q9imy2oiyj08yaj9m/graphql');
  assert.equal(init?.redirect,'error');
  assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer opaque-token');
  return Response.json({data:{user:identity}});
 });
 assert.deepEqual(user,{id:'ls-user',email:'abed@apex-consulting.ai'});
});
test('disabled, unverified, missing identity and GraphQL errors fail closed',async()=>{
 for(const body of [ {data:{user:{...identity,enabled:false}}}, {data:{user:{...identity,emailVerified:false}}}, {data:{user:{...identity,id:''}}}, {data:{user:null}}, {data:{user:identity},errors:[{message:'failure'}]} ]) {
  await assert.rejects(verifyLearningSuiteIdentity('opaque-token',async()=>Response.json(body)));
 }
 await assert.rejects(verifyLearningSuiteIdentity('bad token',async()=>Response.json({data:{user:identity}})));
 await assert.rejects(verifyLearningSuiteIdentity('opaque-token',async()=>Response.json({}, {status:401})));
});
