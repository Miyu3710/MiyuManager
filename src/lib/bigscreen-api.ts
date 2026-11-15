import { invoke, isTauri } from "@tauri-apps/api/core";

export interface BigScreenState {
  open: boolean;
  display: number | null;
  message: string | null;
}

const previewState: BigScreenState = {
  open: false,
  display: 0,
  message: null,
};

export async function getBigScreenState(): Promise<BigScreenState> {
  if (!isTauri()) {
    return previewState;
  }
  return invoke<BigScreenState>("bigscreen_state");
}

export async function openBigScreen(display: number | null): Promise<BigScreenState> {
  if (!isTauri()) {
    return { ...previewState, open: true, display };
  }
  return invoke<BigScreenState>("bigscreen_open", { display });
}

export async function moveBigScreen(display: number): Promise<BigScreenState> {
  if (!isTauri()) {
    return { ...previewState, open: true, display };
  }
  return invoke<BigScreenState>("bigscreen_move", { display });
}

export async function closeBigScreen(): Promise<void> {
  if (!isTauri()) {
    return;
  }
  await invoke("bigscreen_close");
}

export async function openBigScreenDetail(workId: number): Promise<void> {
  if (!isTauri()) {
    window.location.hash = "#/work/" + workId;
    return;
  }
  await invoke("bigscreen_open_detail", { workId });
}
