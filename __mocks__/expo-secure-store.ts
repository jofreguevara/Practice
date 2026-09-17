/**
 * expo-secure-store mock — native keychain is unavailable in Jest.
 */

export const getItemAsync = jest.fn(() => Promise.resolve(null));
export const setItemAsync = jest.fn(() => Promise.resolve());
export const deleteItemAsync = jest.fn(() => Promise.resolve());