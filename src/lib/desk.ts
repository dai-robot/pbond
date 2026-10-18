import type { FirmId, RoomType } from "./types.ts";

/** 引受・ドキュメントの担当者。チャット参加は人ごと */
export interface DeskPerson {
  id: string;
  firmId: FirmId;
  name: string;
  desk: "UNDERWRITING" | "DOCUMENTATION";
}

export const DESK_PEOPLE: DeskPerson[] = [
  { id: "alpha-uw-aoki", firmId: "alpha", name: "青木", desk: "UNDERWRITING" },
  { id: "alpha-uw-kondo", firmId: "alpha", name: "近藤", desk: "UNDERWRITING" },
  { id: "alpha-doc-nishi", firmId: "alpha", name: "西", desk: "DOCUMENTATION" },
  { id: "alpha-doc-hara", firmId: "alpha", name: "原", desk: "DOCUMENTATION" },
  { id: "beta-uw-sato", firmId: "beta", name: "佐藤", desk: "UNDERWRITING" },
  { id: "beta-uw-ito", firmId: "beta", name: "伊藤", desk: "UNDERWRITING" },
  { id: "beta-doc-watanabe", firmId: "beta", name: "渡辺", desk: "DOCUMENTATION" },
  { id: "beta-doc-kobayashi", firmId: "beta", name: "小林", desk: "DOCUMENTATION" },
  { id: "gamma-uw-kato", firmId: "gamma", name: "加藤", desk: "UNDERWRITING" },
  { id: "gamma-doc-yoshida", firmId: "gamma", name: "吉田", desk: "DOCUMENTATION" },
  { id: "delta-uw-saito", firmId: "delta", name: "斎藤", desk: "UNDERWRITING" },
  { id: "delta-doc-yamada", firmId: "delta", name: "山田", desk: "DOCUMENTATION" },
  { id: "epsilon-uw-takahashi", firmId: "epsilon", name: "高橋", desk: "UNDERWRITING" },
  { id: "epsilon-doc-nakamura", firmId: "epsilon", name: "中村", desk: "DOCUMENTATION" },
];

export function deskPersonById(id: string) {
  return DESK_PEOPLE.find((p) => p.id === id);
}

/** ロールと所属が一致する担当者。切替直後でずれていれば自社の先頭を使う */
export function activeDeskPerson(desk: "UNDERWRITING" | "DOCUMENTATION", firmId: FirmId, deskPersonId: string) {
  const current = deskPersonById(deskPersonId);
  if (current && current.desk === desk && current.firmId === firmId) return current;
  return DESK_PEOPLE.find((p) => p.firmId === firmId && p.desk === desk) ?? DESK_PEOPLE.find((p) => p.desk === desk)!;
}

export function deskPeopleOf(firmId: FirmId) {
  return DESK_PEOPLE.filter((p) => p.firmId === firmId);
}

/**
 * 未設定のときの初期参加。
 * 同じデスクの先頭の人だけ、その種類のチャットに入れる。もう一人は入れない。
 */
export function defaultChatRooms(person: DeskPerson): RoomType[] {
  const peers = DESK_PEOPLE.filter((p) => p.firmId === person.firmId && p.desk === person.desk);
  if (peers[0]?.id !== person.id) return [];
  return person.desk === "UNDERWRITING" ? ["UNDERWRITING"] : ["DOCUMENTATION"];
}
