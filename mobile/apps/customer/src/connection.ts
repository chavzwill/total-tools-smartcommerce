import * as SecureStore from 'expo-secure-store';
import {createMobileConnection} from '@smartcommerce/core';

// No browser/localStorage fallback: these credentials are native-device only.
const options={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
let connection:ReturnType<typeof createMobileConnection>|undefined;
export function getConnection(){
 if(!connection){
  const baseUrl=process.env.EXPO_PUBLIC_API_ORIGIN;
  if(!baseUrl)throw Error('A secure API origin must be configured for this build.');
  connection=createMobileConnection({baseUrl,audience:'customer',store:{
   get:key=>SecureStore.getItemAsync(key,options),
   set:(key,value)=>SecureStore.setItemAsync(key,value,options),
   remove:key=>SecureStore.deleteItemAsync(key,options)
  }});
 }
 return connection;
}
