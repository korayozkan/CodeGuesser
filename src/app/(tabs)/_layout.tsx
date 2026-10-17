import { Tabs } from "expo-router";
import { HomeIcon, Trophy, User } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: {
          borderTopColor: "#334155",
          borderTopWidth: 1,
          height: 60,
          position: "absolute",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <HomeIcon
              size={26}
              color={color}
              strokeWidth={focused ? 2.5 : 1.8}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Trophy size={26} color={color} strokeWidth={focused ? 2.5 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <User size={26} color={color} strokeWidth={focused ? 2.5 : 1.8} />
          ),
        }}
      />
    </Tabs>
  );
}
