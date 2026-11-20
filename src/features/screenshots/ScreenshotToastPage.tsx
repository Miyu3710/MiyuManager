import { Check, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import "./screenshot-toast.css";

function readToastQuery(): URLSearchParams {
  const hash = window.location.hash;
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  return new URLSearchParams(query);
}

export function ScreenshotToastPage() {
  const query = readToastQuery();
  const success = query.get("state") === "success";
  const title = query.get("title")?.trim() || "当前游戏";
  const message = query.get("message")?.trim() || "请稍后重试";

  useEffect(() => {
    document.documentElement.classList.add("screenshot-toast-window");
    document.body.classList.add("screenshot-toast-window");
    return () => {
      document.documentElement.classList.remove("screenshot-toast-window");
      document.body.classList.remove("screenshot-toast-window");
    };
  }, []);

  return (
    <div
      className={success ? "screenshot-toast is-success" : "screenshot-toast is-error"}
      role="status"
      aria-live="polite"
    >
      <span className="screenshot-toast__icon" aria-hidden="true">
        {success ? <Check size={19} strokeWidth={2.2} /> : <TriangleAlert size={19} strokeWidth={1.9} />}
      </span>
      <div className="screenshot-toast__copy">
        <strong>{success ? "截图已保存" : "截图失败"}</strong>
        <span>{success ? title : message}</span>
      </div>
    </div>
  );
}
