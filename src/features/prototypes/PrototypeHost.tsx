import { useEffect } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { directions, getWork } from "./data";
import { ArchiveApp } from "./archive/ArchiveApp";
import { ChannelApp } from "./channel/ChannelApp";
import { ScreeningApp } from "./screening/ScreeningApp";
import type { Direction, PrototypePage } from "./types";

function asDirection(value: string | undefined): Direction | null {
  return value === "screening" || value === "archive" || value === "channel" ? value : null;
}

export function PrototypeHost() {
  const { direction: directionParam, workId } = useParams();
  const location = useLocation();
  const direction = asDirection(directionParam);

  useEffect(() => {
    if (!direction) {
      return;
    }
    document.title = `${directions[direction].name} · MiyuManager 原型`;
  }, [direction]);

  if (!direction) {
    return <Navigate to="/" replace />;
  }

  const page: PrototypePage = location.pathname.endsWith("/library")
    ? "library"
    : workId
      ? "detail"
      : "home";
  const work = getWork(workId);

  if (direction === "screening") {
    return <ScreeningApp page={page} work={work} />;
  }

  if (direction === "archive") {
    return <ArchiveApp page={page} work={work} />;
  }

  return <ChannelApp page={page} work={work} />;
}
