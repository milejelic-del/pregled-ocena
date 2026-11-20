/** Otključavanje otiskom prsta (ili licem / šablonom telefona kao rezervom). */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export async function biometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function unlock(reason = 'Otključajte Pregled ocena'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: 'Otkaži' });
    return r.success;
  } catch {
    return false;
  }
}
