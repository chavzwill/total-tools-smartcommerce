import {View,Text,StyleSheet} from 'react-native';
export default function App(){return <View style={styles.screen}><Text accessibilityRole="header" style={styles.title}>Smartcommerce</Text><Text>Mobile development build</Text><Text>Account and service connections are being implemented.</Text></View>;}
const styles=StyleSheet.create({screen:{flex:1,padding:24,justifyContent:'center',gap:12,backgroundColor:'#f7f8f5'},title:{fontSize:28,fontWeight:'700',color:'#08763f'}});
