/**
 * Čuvanje kredencijala u sefu telefona (Android Keystore / iOS Keychain)
 * preko expo-secure-store. Lozinka se nikad ne upisuje u običan fajl.
 */
import * as SecureStore from 'expo-secure-store';

const USER_KEY = 'ednevnik_username';
const PASS_KEY = 'ednevnik_password';
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function isAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function saveCredentials(username: string, password: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(USER_KEY, username, OPTS);
    await SecureStore.setItemAsync(PASS_KEY, password, OPTS);
    return true;
  } catch {
    return false;
  }
}

export async function loadCredentials(): Promise<{ username: string; password: string } | null> {
  try {
    const username = await SecureStore.getItemAsync(USER_KEY, OPTS);
    const password = await SecureStore.getItemAsync(PASS_KEY, OPTS);
    return username && password ? { username, password } : null;
  } catch {
    return null;
  }
}

export async function deleteCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(USER_KEY, OPTS);
    await SecureStore.deleteItemAsync(PASS_KEY, OPTS);
  } catch {
    /* nema šta da se obriše */
  }
}
