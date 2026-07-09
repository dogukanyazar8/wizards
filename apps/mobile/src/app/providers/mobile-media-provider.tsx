import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clearMobileMediaSelectedAsset,
  createCheckingMobileMediaRuntimeState,
  createInitialMobileMediaRuntimeState,
  type MobileMediaRuntimeState,
} from "../../media/mobile-media-contract";
import {
  requestMobileCameraPermissionAfterUserAction,
  requestMobileDocumentPickerAfterUserAction,
  requestMobilePhotoLibraryPickerAfterUserAction,
  requestMobilePhotoLibraryPermissionAfterUserAction,
} from "../../media/mobile-media-runtime";

interface MobileMediaRuntime {
  readonly clearSelectedAsset: () => void;
  readonly requestCameraPermission: () => Promise<void>;
  readonly requestDocumentPicker: () => Promise<void>;
  readonly requestPhotoLibraryPermission: () => Promise<void>;
  readonly requestPhotoLibraryPicker: () => Promise<void>;
  readonly state: MobileMediaRuntimeState;
}

const MobileMediaRuntimeContext = createContext<MobileMediaRuntime | null>(null);

export function MobileMediaProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState(createInitialMobileMediaRuntimeState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const requestPhotoLibraryPermission = useCallback(async () => {
    setState((current) => createCheckingMobileMediaRuntimeState(current, "photoLibrary"));
    setState(await requestMobilePhotoLibraryPermissionAfterUserAction(stateRef.current));
  }, []);

  const requestPhotoLibraryPicker = useCallback(async () => {
    setState((current) => createCheckingMobileMediaRuntimeState(current, "photoLibrary"));
    setState(await requestMobilePhotoLibraryPickerAfterUserAction(stateRef.current));
  }, []);

  const requestCameraPermission = useCallback(async () => {
    setState((current) => createCheckingMobileMediaRuntimeState(current, "camera"));
    setState(await requestMobileCameraPermissionAfterUserAction(stateRef.current));
  }, []);

  const requestDocumentPicker = useCallback(async () => {
    setState((current) => createCheckingMobileMediaRuntimeState(current, "documentPicker"));
    setState(await requestMobileDocumentPickerAfterUserAction(stateRef.current));
  }, []);

  const clearSelectedAsset = useCallback(() => {
    setState(clearMobileMediaSelectedAsset);
  }, []);

  const value = useMemo(
    () => ({
      clearSelectedAsset,
      requestCameraPermission,
      requestDocumentPicker,
      requestPhotoLibraryPermission,
      requestPhotoLibraryPicker,
      state,
    }),
    [
      clearSelectedAsset,
      requestCameraPermission,
      requestDocumentPicker,
      requestPhotoLibraryPermission,
      requestPhotoLibraryPicker,
      state,
    ],
  );

  return (
    <MobileMediaRuntimeContext.Provider value={value}>
      {children}
    </MobileMediaRuntimeContext.Provider>
  );
}

export function useMobileMediaRuntime(): MobileMediaRuntime {
  const runtime = useContext(MobileMediaRuntimeContext);
  if (!runtime) {
    throw new Error("Mobile media provider is missing.");
  }

  return runtime;
}
