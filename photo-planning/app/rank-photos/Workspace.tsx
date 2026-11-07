"use client";
import { useEffect, useState } from "react";
import LightroomRank from "./LightroomRank";
import RankPhotos from "./RankPhotos";
import styles from "./rank.module.css";
export default function Workspace() {
  const [source, setSource] = useState("lightroom");
  useEffect(() => { if (new URLSearchParams(location.search).get("source") === "files" && !location.hash.includes("lr=")) setSource("files"); }, []);
  function change(value: string) { setSource(value); history.replaceState(null, "", location.pathname + (value === "files" ? "?source=files" : "")); }
  return <><nav className={styles.sourceTabs} aria-label="Photo source"><button aria-current={source === "lightroom" ? "page" : undefined} onClick={() => change("lightroom")}>Lightroom on this Mac</button><button aria-current={source === "files" ? "page" : undefined} onClick={() => change("files")}>Browser files</button></nav>{source === "lightroom" ? <LightroomRank /> : <RankPhotos />}</>;
}
