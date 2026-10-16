import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isSameOriginRequest,requestOrigin} from '../lib/request-security';
test('browser origin matches the destination host, not the development bind address',()=>{
  const request=new Request('http://0.0.0.0:3001/api/auth',{headers:{host:'localhost:3001',origin:'http://localhost:3001'}});
  assert.equal(requestOrigin(request),'http://localhost:3001');assert.equal(isSameOriginRequest(request),true);
});
test('origin checks reject other sites, mismatched schemes, and missing origins',()=>{
  for(const origin of ['https://attacker.example','http://care.example','null'])assert.equal(isSameOriginRequest(new Request('https://care.example/api/auth',{headers:{host:'care.example',origin}})),false);
  assert.equal(isSameOriginRequest(new Request('https://care.example/api/auth',{headers:{host:'care.example'}})),false);
});
