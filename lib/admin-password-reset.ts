export type ResetStage={phase:string;email_status:string};
export async function runAdminPasswordReset(deps:{begin:()=>Promise<ResetStage>;update:()=>Promise<void>;inspect:()=>Promise<ResetStage>;fail:()=>Promise<void>;send:()=>Promise<void>;record:(accepted:boolean)=>Promise<void>}){
 let stage=await deps.begin();
 if(!['claimed','password_set'].includes(stage.phase))throw new Error('This reset request is no longer active. Close the dialog and start a new reset if needed.');
 if(stage.phase==='claimed'){
  try{await deps.update();}catch(error){
   // An Auth response can be lost after its transaction commits. Check the recorded state before retrying anything.
   stage=await deps.inspect();
   if(stage.phase!=='password_set'){await deps.fail();throw error;}
  }
 }
 if(stage.email_status==='accepted_by_provider')return {reset:true,emailAccepted:true,recorded:true};
 let accepted=false;try{await deps.send();accepted=true;}catch{accepted=false;}
 let recorded=true;try{await deps.record(accepted);}catch{recorded=false;}
 return {reset:true,emailAccepted:accepted,recorded};
}
