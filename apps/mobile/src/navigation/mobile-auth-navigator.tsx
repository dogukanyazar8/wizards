import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useReducedMotion } from "react-native-reanimated";

import {
  MobileAuthBackupCodeScreenContainer,
  MobileAuthForgotPasswordScreenContainer,
  MobileAuthLoginScreenContainer,
  MobileAuthRegisterScreenContainer,
  MobileAuthSessionCheckingContainer,
  MobileAuthSessionErrorContainer,
  MobileAuthTwoFactorScreenContainer,
} from "../app/screens/auth/mobile-auth-screen-containers";
import type { MobileAuthStackParamList } from "./mobile-auth-navigation-types";

const AuthStack = createNativeStackNavigator<MobileAuthStackParamList>();

export interface MobileAuthNavigatorProps {
  readonly reason: "auth-required" | "checking" | "session-error";
}

export function MobileAuthNavigator({ reason }: MobileAuthNavigatorProps) {
  const reducedMotion = useReducedMotion() === true;

  if (reason === "checking") {
    return <MobileAuthSessionCheckingContainer />;
  }

  if (reason === "session-error") {
    return <MobileAuthSessionErrorContainer />;
  }

  return (
    <AuthStack.Navigator
      initialRouteName="Login"
      screenOptions={{
        animation: reducedMotion ? "none" : "slide_from_right",
        headerShown: false,
      }}
    >
      <AuthStack.Screen component={MobileAuthLoginScreenContainer} name="Login" />
      <AuthStack.Screen component={MobileAuthRegisterScreenContainer} name="Register" />
      <AuthStack.Screen component={MobileAuthForgotPasswordScreenContainer} name="ForgotPassword" />
      <AuthStack.Screen component={MobileAuthTwoFactorScreenContainer} name="TwoFactor" />
      <AuthStack.Screen component={MobileAuthBackupCodeScreenContainer} name="BackupCode" />
    </AuthStack.Navigator>
  );
}
