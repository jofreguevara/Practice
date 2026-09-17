/**
 * expo-application mock for Jest — native binding unavailable in Node.
 */

export const applicationName: string | null = 'Practice';
export const applicationId: string | null = 'com.practice.app';
export const nativeApplicationVersion: string | null = '0.1.0';
export const nativeBuildVersion: string | null = '1';
export const pushNotificationServiceEnvironment: string | null = null;
export const releaseChannel: string | null = 'default';

export function getAndroidId(): string {
  return 'mock-android-id';
}

export function getIosIdForVendor(): string {
  return 'mock-ios-id-for-vendor';
}