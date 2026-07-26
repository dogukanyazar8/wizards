import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { BottomSheet, useSheetPresentation, useToast } from "../app/components/kit";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import type { MobileApiClient } from "../api/mobile-api-client";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { useMobileProfileSheetStyles } from "./mobile-profile-sheets.styles";
import { MOBILE_USER_NOTE_MAX_LENGTH, normalizeMobileUserNote } from "./mobile-user-note-client";
import { useMobileUserNoteMutation } from "./mobile-user-note-query";

export const MOBILE_USER_NOTE_SHEET_TEST_ID = "mobile-profile-note-sheet";

export interface MobileUserNoteSheetProps {
  readonly client: MobileApiClient;
  /** Current stored note, or `null` when the viewer has not written one yet. */
  readonly note: string | null;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly userId: string;
  /** Shown in both the title and the privacy line, so the subject is unambiguous. */
  readonly username: string;
}

/**
 * Handoff 2b. A private note about another person: nobody but its author can
 * read it, which is why the sheet says so under the field instead of relying on
 * the user remembering.
 *
 * The sheet rides the shared `BottomSheet`, whose panel already translates by
 * the keyboard height (9a keyboard region), so the field stays above the
 * keyboard without this screen owning any keyboard maths of its own.
 */
export function MobileUserNoteSheet({
  client,
  note,
  onClose,
  open,
  userId,
  username,
}: MobileUserNoteSheetProps) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileProfileSheetStyles();
  const theme = useTheme();
  const presentation = useSheetPresentation();
  const { showToast } = useToast();
  const saveNote = useMobileUserNoteMutation(client);

  const [draft, setDraft] = useState(note ?? "");
  const [focused, setFocused] = useState(false);
  const [failed, setFailed] = useState(false);

  // Re-seeding on open (rather than on every `note` change) keeps a save that
  // lands while the sheet is still up from yanking the text out from under a
  // user who kept typing.
  useEffect(() => {
    if (open) {
      setDraft(note ?? "");
      setFailed(false);
    }
  }, [note, open, userId]);

  const storedNote = note ?? "";
  const isChanged = normalizeMobileUserNote(draft) !== normalizeMobileUserNote(storedNote);
  const canSave = isChanged && !saveNote.isPending;
  const title = copy.profileNoteSheetTitleFor.replace("{user}", username);

  // Clearing the field is how a note is deleted — there is no separate delete
  // control — so an emptied save is the one that gets the undo offer.
  const isDeletion =
    normalizeMobileUserNote(draft) === "" && normalizeMobileUserNote(storedNote) !== "";

  const submit = () => {
    if (!canSave) {
      return;
    }

    setFailed(false);
    saveNote.mutate(
      { body: draft, userId },
      {
        onError: () => setFailed(true),
        onSuccess: () => {
          onClose();
          if (isDeletion) {
            showToast({
              action: {
                label: copy.toastUndoAction,
                onPress: () => saveNote.mutate({ body: storedNote, userId }),
              },
              subtitle: copy.toastNoteDeletedSubtitle.replace("{user}", username),
              title: copy.toastNoteDeletedTitle,
              variant: "action",
            });
          }
        },
      },
    );
  };

  return (
    <BottomSheet
      accessibilityLabel={title}
      onClose={onClose}
      open={open}
      presentation={{
        contentStyle: styles.content,
        handleAreaStyle: styles.handleArea,
        handleStyle: styles.handle,
        panelStyle: [presentation.panelStyle, styles.panel],
      }}
      sizing="content"
      testID={MOBILE_USER_NOTE_SHEET_TEST_ID}
    >
      <View style={styles.noteRoot}>
        <View style={styles.noteHeader}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.noteTitle}
            testID={`${MOBILE_USER_NOTE_SHEET_TEST_ID}-title`}
          >
            {title}
          </Text>
          <Pressable
            accessibilityLabel={copy.profileNoteSheetSave}
            accessibilityRole="button"
            accessibilityState={{ busy: saveNote.isPending, disabled: !canSave }}
            disabled={!canSave}
            onPress={submit}
            style={styles.noteSaveAction}
            testID={`${MOBILE_USER_NOTE_SHEET_TEST_ID}-save`}
          >
            <Text style={[styles.noteSaveLabel, !canSave && styles.noteSaveLabelDisabled]}>
              {copy.profileNoteSheetSave}
            </Text>
          </Pressable>
        </View>

        <View style={[styles.noteFieldRing, focused && styles.noteFieldRingFocused]}>
          <View style={[styles.noteField, focused && styles.noteFieldFocused]}>
            <TextInput
              accessibilityLabel={title}
              autoFocus={open}
              editable={!saveNote.isPending}
              maxLength={MOBILE_USER_NOTE_MAX_LENGTH}
              multiline
              onBlur={() => setFocused(false)}
              onChangeText={setDraft}
              onFocus={() => setFocused(true)}
              placeholder={copy.profileNoteSheetPlaceholder}
              placeholderTextColor={theme.text.placeholder}
              style={styles.noteInput}
              testID={`${MOBILE_USER_NOTE_SHEET_TEST_ID}-input`}
              value={draft}
            />
            <Text style={styles.noteCounter} testID={`${MOBILE_USER_NOTE_SHEET_TEST_ID}-counter`}>
              {`${draft.length}/${MOBILE_USER_NOTE_MAX_LENGTH}`}
            </Text>
          </View>
        </View>

        <View style={styles.notePrivacy}>
          <MobileLineIcon color={theme.profileSheet.hint} name="lock" size={12} />
          <Text
            numberOfLines={2}
            style={styles.notePrivacyLabel}
            testID={`${MOBILE_USER_NOTE_SHEET_TEST_ID}-privacy`}
          >
            {copy.profileNoteSheetPrivacy.replace("{user}", username)}
          </Text>
        </View>

        {failed ? (
          <Text
            accessibilityRole="alert"
            style={styles.noteError}
            testID={`${MOBILE_USER_NOTE_SHEET_TEST_ID}-error`}
          >
            {copy.profileNoteSheetError}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
