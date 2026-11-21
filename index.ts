import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import './src/background'; // pozadinski zadatak mora biti definisan pri pokretanju
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
