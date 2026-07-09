import { StyleSheet } from "react-native";
import { mobileColors, mobileRadii } from "../../design/tokens";
import { sharedStyles } from "../styles/shared-styles";

export const mediaPrimitiveStyles = StyleSheet.create({
  mediaRuntimeStatusLabel: {
    color: mobileColors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  mediaRuntimeStatusPill: {
    minHeight: 46,
    flexGrow: 1,
    flexBasis: 138,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: mobileColors.border,
    borderRadius: mobileRadii.control,
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mediaRuntimeStatusText: {
    flex: 1,
    minWidth: 0,
  },
  mediaRuntimeStatusValue: {
    marginTop: 2,
    color: mobileColors.muted,
    fontSize: 11,
    fontWeight: "800",
  },
});

export const styles = {
  ...sharedStyles,
  ...mediaPrimitiveStyles,
};
