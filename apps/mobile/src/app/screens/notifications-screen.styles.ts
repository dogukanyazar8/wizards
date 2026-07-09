import { StyleSheet } from "react-native";
import { mobileRadii } from "../../design/tokens";
import { sharedStyles } from "../styles/shared-styles";

export const notificationsScreenStyles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    minWidth: 0,
  },
  mediaRuntimeStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
  },
  mediaSelectedAssetCard: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: mobileRadii.control,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
});

export const styles = {
  ...sharedStyles,
  ...notificationsScreenStyles,
};
