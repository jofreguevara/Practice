/**
 * expo-network mock — `assertNoNetwork` reads this in capability.ts.
 *
 * Each export is a `jest.fn()` so individual tests can override the return
 * value via `mockResolvedValueOnce(...)`. The defaults report offline so
 * any accidental network call is loud.
 */

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: 'none' | 'wifi' | 'cellular' | 'ethernet' | 'unknown';
}

export const getNetworkStateAsync = jest.fn<Promise<NetworkState>, []>(() =>
  Promise.resolve({
    isConnected: false,
    isInternetReachable: false,
    type: 'none',
  }),
);

export const isConnected = jest.fn<Promise<boolean>, []>(() => Promise.resolve(false));