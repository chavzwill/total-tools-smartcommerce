import React,{useEffect,useRef,useState} from 'react';
import {Text} from 'react-native';
import {ApiError} from '@smartcommerce/core';
import {randomUUID} from 'expo-crypto';
import {AuthGate,Page,Action,Field,Item,Notice,type Connection} from '@smartcommerce/ui';
import {getConnection} from '../src/connection';
type Application={id:string;status:string;version:number;decisionReason?:string};
type Job={id:string;orderNumber:string;status:string;version:number};
function Workspace({connection,name,logout}:{connection:Connection;name:string;logout:()=>Promise<void>}){
 const [application,setApplication]=useState<Application|null>(null),[driver,setDriver]=useState<{active:boolean}|null>(null),[jobs,setJobs]=useState<Job[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [businessName,setBusiness]=useState(''),[contactName,setContact]=useState(name),[email,setEmail]=useState(''),[phone,setPhone]=useState(''),[description,setDescription]=useState('');
 const pending=useRef<Record<string,unknown>|null>(null);
 async function load(){setBusy(true);try{
  const profile=await connection.api.request('/driver/profile',{},value=>{const v=value as {application:Application|null;driver?:{active:boolean}|null};if(!v||!('application' in v))throw Error('Invalid profile');return v;});setApplication(profile.application);setDriver(profile.driver||null);if(profile.application&&pending.current?.action==='create_application'&&pending.current.id===profile.application.id)pending.current=null;
  setJobs(await connection.api.request('/driver/jobs',{},value=>{const v=value as {jobs:Job[]};if(!v||!Array.isArray(v.jobs))throw Error('Invalid jobs');return v.jobs;}));
  setMessage('Pickup, acceptance and delivery updates require verified POS approval.');
 }catch{setMessage('Your courier workspace could not be loaded. Please refresh.');}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 async function save(){setBusy(true);try{
  if(!pending.current)pending.current=application?{action:'submit_application',id:application.id,expectedVersion:application.version,idempotencyKey:randomUUID()}:{action:'create_application',id:randomUUID(),idempotencyKey:randomUUID(),input:{businessName,contactName,email,phone,description}};
  await connection.api.request('/driver/application',{method:'POST',body:pending.current},value=>value);pending.current=null;await load();
 }catch(error){if(error instanceof ApiError&&error.status===400){pending.current=null;setMessage('Check your application details, including email and phone number, then try again.');}else setMessage('Submission could not be confirmed. Refresh to check its status before retrying.');}finally{setBusy(false);}}
 return <Page title="Courier workspace" subtitle={name}><Notice text={message}/><Action label={busy?'Loading…':'Refresh workspace'} disabled={busy} onPress={()=>{void load();}} secondary/>{application?<Item title="Your application" detail={application.status+(application.decisionReason?' · '+application.decisionReason:'')}>{['draft','rejected'].includes(application.status)&&<Action label="Submit application for verification" disabled={busy} onPress={()=>{void save();}}/>}<Notice text="A saved application is not evidence of POS approval."/></Item>:driver?<Item title="Your driver profile" detail={driver.active?'Linked to your delivery organisation':'Your driver profile is inactive'}/>:<Item title="Apply as a delivery partner"><Field label="Business name" value={businessName} onChangeText={setBusiness}/><Field label="Contact name" value={contactName} onChangeText={setContact}/><Field label="Email address" value={email} onChangeText={setEmail} email/><Field label="Phone number" value={phone} onChangeText={setPhone}/><Field label="Delivery service description" value={description} onChangeText={setDescription}/><Action label="Save application" disabled={busy||![businessName,contactName,email,phone,description].every(v=>v.trim())} onPress={()=>{void save();}}/></Item>}<Item title="Assigned deliveries">{jobs.length===0?<Text>No assigned deliveries to show.</Text>:jobs.map(job=><Item key={job.id} title={job.orderNumber} detail={job.status==='assigned'?'Assigned':job.status==='needs_review'?'Needs review':job.status==='awaiting_driver'?'Awaiting driver':'Status unavailable'}/>)}</Item><Action label="Sign out" secondary onPress={()=>{void logout();}}/></Page>;
}
export default function Courier(){return <AuthGate getConnection={getConnection} title="Sign in to Smartcommerce Courier">{(connection,account,logout)=><Workspace connection={connection} name={account.fullName} logout={logout}/>}</AuthGate>;}
