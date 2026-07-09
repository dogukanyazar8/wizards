import { StyleSheet } from "react-native";
import { sharedStyles } from "./styles/shared-styles";

export const mobileRootScreenStyles = StyleSheet.create({
  activeScreenFrame: {
    flex: 1,
    minWidth: 0,
  },
});

export const styles = {
  ...sharedStyles,
  ...mobileRootScreenStyles,
};
