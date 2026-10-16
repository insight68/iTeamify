import { useEffect, useState, type ReactNode } from "react";
import { ActionSheetIOS, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";

interface SheetOptions {
  title?: string;
  message?: string;
  options: string[];
  cancelButtonIndex: number;
  destructiveButtonIndex?: number | number[];
}
interface SheetRequest { options: SheetOptions; onSelect: (index: number) => void; }
let present: ((request: SheetRequest) => void) | undefined;

/** Platform plumbing for the existing menus; business actions stay at call sites. */
export function showActionSheet(options: SheetOptions, onSelect: (index: number) => void) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(options, onSelect);
  } else if (present) {
    present({ options, onSelect });
  } else {
    onSelect(options.cancelButtonIndex);
  }
}

export function ActionSheetProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<SheetRequest | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    present = setRequest;
    return () => { if (present === setRequest) present = undefined; };
  }, []);
  const select = (index: number) => {
    setRequest(null);
    request?.onSelect(index);
  };
  const cancel = () => { if (request) select(request.options.cancelButtonIndex); };
  return <>
    {children}
    {Platform.OS !== "ios" ? <Modal transparent visible={!!request} animationType="fade" onRequestClose={cancel}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="absolute inset-0" onPress={cancel} accessibilityLabel="Dismiss menu" />
        <View className="rounded-t-2xl bg-background" style={{ maxHeight: "80%", paddingBottom: Math.max(insets.bottom, 16) }} accessibilityViewIsModal>
          {request?.options.title ? <Text className="px-5 pt-5 pb-2 text-lg font-semibold">{request.options.title}</Text> : null}
          {request?.options.message ? <Text className="px-5 pb-3 text-muted-foreground">{request.options.message}</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled">
            {request?.options.options.map((label, index) => {
              const destructive = request.options.destructiveButtonIndex;
              const danger = Array.isArray(destructive) ? destructive.includes(index) : destructive === index;
              return <Pressable key={`${index}:${label}`} onPress={() => select(index)} accessibilityRole="button" className="px-5 py-4 active:bg-secondary" style={{ minHeight: 48 }}>
                <Text className={danger ? "text-base text-destructive" : "text-base text-foreground"}>{label}</Text>
              </Pressable>;
            })}
          </ScrollView>
        </View>
      </View>
    </Modal> : null}
  </>;
}
