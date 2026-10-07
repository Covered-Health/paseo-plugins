import { Platform } from "react-native";

// Browser APIs stay isolated here; native clients use Paseo's copyText.
declare const navigator: { clipboard?: { write(items: unknown[]): Promise<void> } };
declare const ClipboardItem: new (data: Record<string, unknown>) => unknown;
declare const Blob: new (parts: string[], options: { type: string }) => unknown;

export async function copyRich(html: string, text: string): Promise<boolean> {
  if (Platform.OS !== "web" || typeof navigator === "undefined" ||
      !navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
    return true;
  } catch {
    return false;
  }
}
