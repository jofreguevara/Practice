/**
 * expo-device mock for Jest.
 *
 * Production: native binding exposed via expo-modules-core; not loadable in Node.
 *
 * Tests control the returned values by reassigning the named exports before
 * calling `probe()`. Defaults below match the bootstrap sandbox so the RED
 * capability test from Sub-change 1 still passes.
 */

export const brand: string | null = 'apple';
export const manufacturer: string | null = 'Apple';
export const modelName: string | null = 'iPhone';
export const deviceName: string | null = 'Test iPhone';
export const deviceYearClass: number | null = 2023;
export const isDevice: boolean = true;
export const osName: string | null = 'iOS';
export const osVersion: string | null = '17.0';
export const osInternalBuildId: string | null = null;
export const platformApiLevel: number | null = null;
export const modelId: string | null = 'iPhone15,2';
export const designName: string | null = null;
export const productName: string | null = null;
export const supportedCpuArchitectures: string[] | null = ['arm64-v8a'];
export const totalMemory: number | null = 4 * 1024 * 1024 * 1024; // 4 GB

export function getDeviceTypeAsync(): Promise<number> {
  return Promise.resolve(1 /* DeviceType.PHONE */);
}

export function getPlatformFeaturesAsync(): Promise<string[]> {
  return Promise.resolve(['Metal']);
}

export function hasPlatformFeatureAsync(feature: string): Promise<boolean> {
  return Promise.resolve(feature === 'Metal' || feature === 'OpenCL');
}