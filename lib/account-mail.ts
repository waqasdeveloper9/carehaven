import 'server-only';
import nodemailer from 'nodemailer';
import { passwordUpdatedEmail } from './account-actions';

export function passwordEmailConfigured(){return !!process.env.MAIL_FROM&&!!(process.env.RESEND_API_KEY||(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD));}
export async function sendPasswordUpdated(input:Parameters<typeof passwordUpdatedEmail>[0]&{requestId:string}){
 if(!passwordEmailConfigured())throw new Error('Configure a custom email sender before resetting passwords.');
 const content=passwordUpdatedEmail(input);
 if(process.env.RESEND_API_KEY){
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`password-reset/${input.requestId}`},body:JSON.stringify({from:process.env.MAIL_FROM,to:[input.email],...content}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('The email provider did not accept the password notification.');
  return;
 }
 const port=Number(process.env.SMTP_PORT||587);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid SMTP port configuration.');
 const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:process.env.SMTP_SECURE==='true',requireTLS:true,auth:{user:process.env.SMTP_USER!,pass:process.env.SMTP_PASSWORD!},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,logger:false,debug:false});
 try{const result=await transport.sendMail({from:process.env.MAIL_FROM,to:input.email,...content,messageId:`<password-reset-${input.requestId}@${new URL(input.loginUrl).hostname}>`});if(!result.accepted.length)throw new Error('The email provider did not accept the password notification.');}finally{transport.close();}
}
