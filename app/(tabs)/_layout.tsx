/**
 * app/(tabs)/_layout.tsx — tab bar shell.
 *
 * Three tabs (design §2, §11 day-1 step 10):
 *   - Topics  — the 8-card grid; lands in chat-mvp Task 3.4
 *   - Chat    — the conversation host; lands in chat-mvp Task 3.4
 *   - Settings — the hub; lands in chat-mvp Task 3.4
 *
 * For bootstrap we ship text-only placeholders so the tab bar is visible.
 */
import { Tabs } from 'expo-router';

export default function TabsLayout(): React.JSX.Element {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0a84ff',
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e5ea' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Topics',
          tabBarLabel: 'Topics',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarLabel: 'Chat',
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
        }}
      />
    </Tabs>
  );
}