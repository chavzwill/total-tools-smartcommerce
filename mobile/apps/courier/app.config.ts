import type {ExpoConfig} from 'expo/config';
const config:ExpoConfig={
 name:"Smartcommerce Courier",slug:'smartcommerce-courier',scheme:'smartcommerce-courier',version:'0.1.0',
 orientation:'portrait',userInterfaceStyle:'automatic',
 ios:{bundleIdentifier:'com.totaltools.smartcommerce.courier',supportsTablet:true},
 android:{package:'com.totaltools.smartcommerce.courier'},
 plugins:['expo-router','expo-secure-store'],web:{bundler:'metro',output:'static'},
 extra:{audience:'courier'},
};
export default config;
