import type {ExpoConfig} from 'expo/config';
const config:ExpoConfig={
 name:"Smartcommerce",slug:'smartcommerce-customer',scheme:'smartcommerce-customer',version:'0.1.0',
 orientation:'portrait',userInterfaceStyle:'automatic',
 ios:{bundleIdentifier:'com.totaltools.smartcommerce.customer',supportsTablet:true},
 android:{package:'com.totaltools.smartcommerce.customer'},
 plugins:['expo-router','expo-secure-store'],web:{bundler:'metro',output:'static'},
 extra:{audience:'customer'},
};
export default config;
