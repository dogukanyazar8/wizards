import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";

/**
 * G §9: the phone speaks the mobile app's own language. The console's rail,
 * split panes and dense table have no equivalent here — a case is a vertical
 * card stack with three buttons at the bottom, sized like every other detail
 * screen in the app.
 */
const createStyles = (theme: MobileTheme) => ({
  root: {
    backgroundColor: theme.surface.base,
    flex: 1,
  },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 12,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 13,
    borderWidth: 1,
    height: 36,
    justifyContent: "center" as const,
    width: 36,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 17,
    includeFontPadding: false,
  },
  headerSubtitle: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    includeFontPadding: false,
    marginTop: 2,
  },
  content: {
    gap: 10,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  offlineNotice: {
    backgroundColor: theme.status.warningSoft,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  offlineNoticeText: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    includeFontPadding: false,
  },
  card: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  stateCard: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  stateText: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    includeFontPadding: false,
    textAlign: "center" as const,
  },
  caseRow: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
    padding: 14,
  },
  caseRowTop: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8,
  },
  caseNumber: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 13.5,
    includeFontPadding: false,
  },
  caseAge: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    includeFontPadding: false,
    marginLeft: "auto" as const,
  },
  caseSubject: {
    color: theme.text.secondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    includeFontPadding: false,
  },
  caseMetaRow: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 8,
  },
  caseMeta: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    includeFontPadding: false,
  },
  priorityChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  priorityChipCritical: { backgroundColor: theme.status.dangerSoft },
  priorityChipHigh: { backgroundColor: theme.status.warningSoft },
  priorityChipNormal: { backgroundColor: theme.surface.soft },
  priorityChipMuted: { backgroundColor: theme.surface.soft },
  priorityChipLabel: {
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 10.5,
    includeFontPadding: false,
    letterSpacing: 0.2,
    textTransform: "uppercase" as const,
  },
  priorityChipLabelCritical: { color: theme.status.dangerOnBase },
  priorityChipLabelHigh: { color: theme.status.warning },
  priorityChipLabelNormal: { color: theme.text.visualSecondary },
  statusChip: {
    backgroundColor: theme.surface.soft,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  statusChipLabel: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    includeFontPadding: false,
  },
  sectionTitle: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 13,
    includeFontPadding: false,
  },
  reportRow: {
    borderTopColor: theme.border.subtle,
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 10,
  },
  reportRowFirst: { borderTopWidth: 0, paddingTop: 0 },
  reportReason: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 12.5,
    includeFontPadding: false,
  },
  reportDetails: {
    color: theme.text.secondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    includeFontPadding: false,
    lineHeight: 19,
  },
  evidencePreview: {
    backgroundColor: theme.surface.soft,
    borderRadius: 14,
    color: theme.text.secondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12.5,
    includeFontPadding: false,
    lineHeight: 18,
    padding: 12,
  },
  evidenceScope: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 11.5,
    includeFontPadding: false,
  },
  actionStack: {
    gap: 8,
    paddingTop: 4,
  },
  reasonInput: {
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderRadius: 14,
    borderWidth: 1,
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 13.5,
    minHeight: 84,
    padding: 12,
    textAlignVertical: "top" as const,
  },
  pressed: { opacity: 0.82 },
});

export function useMobileAdminStyles() {
  return useThemedStyles(createStyles);
}

export type MobileAdminStyles = ReturnType<typeof useMobileAdminStyles>;
