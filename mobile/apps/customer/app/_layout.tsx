import {Stack} from 'expo-router';
export default function Layout(){return <Stack screenOptions={{headerTintColor:'#08763f',headerStyle:{backgroundColor:'#f7f8f5'}}}><Stack.Screen name="index" options={{title:'Smartcommerce'}}/><Stack.Screen name="account" options={{title:'Account'}}/><Stack.Screen name="cart" options={{title:'Your cart'}}/></Stack>;}
