import React from 'react';
import {AuthGate,Page,Action} from '@smartcommerce/ui';
import {router} from 'expo-router';
import {getConnection} from '../src/connection';
export default function Account(){return <AuthGate getConnection={getConnection} title="Your Smartcommerce account">{(_connection,account,logout)=><Page title={account.fullName} subtitle="Your account"><Action label="Continue shopping" onPress={()=>router.push('/')}/><Action label="View cart" onPress={()=>router.push('/cart')}/><Action label="Sign out" secondary onPress={()=>{void logout();}}/></Page>}</AuthGate>;}
